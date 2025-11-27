#!/usr/bin/env python3
"""
PostgreSQL Tick Data CSV Ingestion Module for QuFLX

Handles ingestion of CSV tick data files into PostgreSQL database via direct connection.
Supports batch processing, error handling, and progress tracking.

CSV Format Expected:
    timestamp,asset,price
    2025-01-15 10:23:45,EURUSD_otc,1.0824
    2025-01-15 10:23:46,EURUSD_otc,1.0825

Usage:
    from backend.db_integrations.supabase_tick_ingestion import TickDataIngestion

    ingestor = TickDataIngestion()
    result = ingestor.ingest_csv_file("path/to/ticks.csv")
"""

import pandas as pd
import psycopg2
from psycopg2.extras import execute_batch
from datetime import datetime
import logging
import os
import time
import re
from typing import List, Dict, Any, Optional
from config.supabase_config import DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, BATCH_SIZE, MAX_RETRIES


class TickDataIngestion:
    """
    Handles tick data CSV file ingestion into PostgreSQL database with robust 
    error handling and batch processing capabilities.
    """

    def __init__(self, batch_size: int = BATCH_SIZE):
        """
        Initialize the PostgreSQL tick data ingestion client.

        Args:
            batch_size: Number of records to insert in each batch
        """
        self.batch_size = batch_size
        self.logger = logging.getLogger(__name__)
        self.db_config = {
            'dbname': DB_NAME,
            'user': DB_USER,
            'password': DB_PASSWORD,
            'host': DB_HOST,
            'port': DB_PORT
        }

        # Configure logging
        if not self.logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
            self.logger.setLevel(logging.INFO)

    def get_connection(self):
        """Create a new PostgreSQL connection."""
        return psycopg2.connect(**self.db_config)

    def parse_filename(self, filepath: str) -> Dict[str, str]:
        """
        Extract asset symbol and optional date from CSV filename.

        Expected formats:
            {SYMBOL}_otc_ticks_{YYYYMMDD}.csv
            {SYMBOL}_otc_tick_data_{DATE}.csv
            {SYMBOL}_ticks.csv

        Examples: 
            EURUSD_otc_ticks_20251025.csv -> symbol='EURUSD_otc', date='2025-10-25'
            ZARUSD_otc_tick_data.csv -> symbol='ZARUSD_otc', date=None

        Args:
            filepath: Path to the CSV file

        Returns:
            Dict containing 'symbol' and optional 'date' (YYYY-MM-DD format)
        """
        filename = os.path.basename(filepath).replace('.csv', '')
        parts = filename.split('_')

        # Find tick keyword index
        tick_index = None
        for i, part in enumerate(parts):
            if part in ['ticks', 'tick']:
                tick_index = i
                break

        if tick_index is None:
            for i, part in enumerate(parts):
                if part.isdigit():
                    tick_index = i
                    break

        if tick_index is None:
            tick_index = len(parts)

        symbol = '_'.join(parts[:tick_index])

        # Extract date if present (YYYYMMDD format)
        date_str = None
        date_pattern = re.compile(r'(\d{8})')
        for part in parts:
            match = date_pattern.search(part)
            if match:
                date_raw = match.group(1)
                try:
                    date_obj = datetime.strptime(date_raw, '%Y%m%d')
                    date_str = date_obj.strftime('%Y-%m-%d')
                    break
                except ValueError:
                    continue

        return {'symbol': symbol, 'date': date_str}

    def inject_date_into_timestamps(self, df: pd.DataFrame, date_str: str) -> pd.DataFrame:
        """
        Inject a date into time-only timestamps (HH:MM:SSZ format).

        Args:
            df: DataFrame with 'timestamp' column
            date_str: Date string in YYYY-MM-DD format

        Returns:
            DataFrame with full datetime timestamps
        """
        self.logger.info(f"Injecting date {date_str} into time-only timestamps")

        def convert_timestamp(ts_value):
            ts_str = str(ts_value).strip()
            
            # Check if it's time-only (HH:MM:SSZ or HH:MM:SS)
            time_pattern = re.match(r'^(\d{1,2}):(\d{2}):(\d{2})', ts_str)
            if time_pattern and len(ts_str) <= 10:
                return f"{date_str}T{ts_str.replace('Z', '')}"
            
            return ts_value

        df['timestamp'] = df['timestamp'].apply(convert_timestamp)
        return df

    def verify_asset_exists(self, symbol: str):
        """
        Verify that an asset exists in the assets table, create if not.

        Args:
            symbol: Asset symbol (e.g., 'EURUSD_otc')

        Raises:
            Exception: If database operation fails
        """
        conn = self.get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM assets WHERE symbol = %s", (symbol,))
                result = cur.fetchone()
                
                if not result:
                    self.logger.info(f"Asset '{symbol}' not found, creating...")
                    
                    # Parse currency pair
                    base_currency = symbol[:3] if len(symbol) >= 3 else symbol
                    quote_currency = symbol[3:6] if len(symbol) >= 6 else None
                    
                    cur.execute("""
                        INSERT INTO assets (symbol, base_currency, quote_currency, asset_type, is_active)
                        VALUES (%s, %s, %s, %s, %s)
                        RETURNING id
                    """, (symbol, base_currency, quote_currency, 'forex', True))
                    
                    conn.commit()
                    self.logger.info(f"✓ Created asset: {symbol}")
                else:
                    self.logger.info(f"✓ Asset verified: {symbol}")
        finally:
            conn.close()

    def validate_csv_data(self, df: pd.DataFrame, filepath: str) -> List[str]:
        """
        Validate CSV data format and content.

        Args:
            df: DataFrame to validate
            filepath: Original file path (for error messages)

        Returns:
            List of validation error messages (empty if valid)
        """
        errors = []

        # Check required columns
        required_base_columns = ['timestamp', 'price']
        missing_base = [col for col in required_base_columns if col not in df.columns]
        
        if missing_base:
            errors.append(f"Missing required columns: {missing_base}")
        
        # Check for asset/pair column
        if 'asset' not in df.columns and 'pair' not in df.columns:
            errors.append("Missing asset identifier column (must have 'asset' or 'pair')")
        
        # Normalize column name to 'asset' if it's 'pair'
        if 'pair' in df.columns and 'asset' not in df.columns:
            df.rename(columns={'pair': 'asset'}, inplace=True)

        if errors:
            return errors

        # Validate timestamp format
        try:
            pd.to_datetime(df['timestamp'], utc=True)
        except Exception as e:
            errors.append(f"Invalid timestamp format: {str(e)}")

        # Validate price column
        try:
            prices = pd.to_numeric(df['price'], errors='coerce')
            if prices.isna().any():
                errors.append("Non-numeric price values found")
            if (prices < 0).any():
                errors.append("Negative price values found")
            if (prices == 0).any():
                errors.append("Warning: Zero price values found")
        except Exception as e:
            errors.append(f"Invalid price data: {str(e)}")

        # Check asset column is non-empty
        if 'asset' in df.columns and df['asset'].isna().any():
            errors.append("Missing asset values in some rows")

        return errors

    def prepare_records_for_insertion(self, df: pd.DataFrame) -> List[tuple]:
        """
        Prepare DataFrame records for PostgreSQL insertion.

        Args:
            df: Validated DataFrame with columns: timestamp, asset, price

        Returns:
            List of tuples ready for insertion (pair, timestamp, price)
        """
        records = []

        for _, row in df.iterrows():
            # Convert timestamp to Unix timestamp (bigint)
            timestamp_dt = pd.to_datetime(row['timestamp'], utc=True)
            if isinstance(timestamp_dt, pd.Timestamp):
                unix_timestamp = int(timestamp_dt.value // 10**9)
            else:
                unix_timestamp = int(timestamp_dt.astype('int64') // 10**9)
            
            records.append((
                row['asset'],
                unix_timestamp,
                float(row['price'])
            ))

        return records

    def insert_batch_with_retry(self, records: List[tuple], batch_num: int) -> tuple:
        """
        Insert a batch of records with retry logic.

        Args:
            records: List of tuples (pair, timestamp, price)
            batch_num: Batch number for logging

        Returns:
            Tuple of (success_count, failure_count)
        """
        insert_query = """
            INSERT INTO historical_ticks (pair, timestamp, price)
            VALUES (%s, %s, %s)
            ON CONFLICT (pair, timestamp) DO NOTHING
        """

        for attempt in range(1, MAX_RETRIES + 1):
            conn = None
            try:
                conn = self.get_connection()
                with conn.cursor() as cur:
                    execute_batch(cur, insert_query, records)
                    inserted = cur.rowcount
                conn.commit()
                
                if inserted > 0:
                    self.logger.info(f"✓ Batch {batch_num}: Inserted {inserted}/{len(records)} records")
                else:
                    self.logger.warning(f"⚠ Batch {batch_num}: {len(records)} duplicates skipped")
                
                return (inserted, len(records) - inserted)
                
            except Exception as e:
                self.logger.warning(f"✗ Batch {batch_num} attempt {attempt}/{MAX_RETRIES} failed: {str(e)}")
                if conn:
                    conn.rollback()
                
                if attempt == MAX_RETRIES:
                    self.logger.error(f"Failed to insert batch {batch_num} after {MAX_RETRIES} attempts")
                    return (0, len(records))
                
                time.sleep(1 * attempt)
            finally:
                if conn:
                    conn.close()

        return (0, len(records))

    def log_ingestion_result(self, file_info: Dict, filepath: str, total_records: int,
                            inserted: int, failed: int, duration: float, status: str, error: str = None):
        """Log ingestion results in a formatted way."""
        self.logger.info("=" * 60)
        self.logger.info("INGESTION RESULT:")
        self.logger.info("=" * 60)
        self.logger.info(f"success: {status == 'completed'}")
        if error:
            self.logger.info(f"error: {error}")
        self.logger.info(f"file: {filepath}")
        self.logger.info(f"asset: {file_info.get('symbol', 'unknown')}")
        self.logger.info(f"records_total: {total_records}")
        self.logger.info(f"records_inserted: {inserted}")
        self.logger.info(f"records_failed: {failed}")
        self.logger.info(f"duration_seconds: {duration:.2f}")
        self.logger.info(f"status: {status}")

    def ingest_csv_file(self, filepath: str, override_symbol: str = None, override_date: str = None) -> Dict[str, Any]:
        """
        Main method to ingest a tick data CSV file into PostgreSQL.

        Args:
            filepath: Path to CSV file
            override_symbol: Optional symbol override
            override_date: Optional date override (YYYY-MM-DD format)

        Returns:
            Dict with ingestion results
        """
        start_time = time.time()
        self.logger.info(f"📤 Starting tick data ingestion of: {os.path.basename(filepath)}")

        try:
            # Parse filename or use override
            if override_symbol:
                file_info = {'symbol': override_symbol}
                self.logger.info(f"Using override symbol: {override_symbol}")
            else:
                file_info = self.parse_filename(filepath)

            # Determine which date to use for time-only timestamps
            date_for_injection = override_date or file_info.get('date')
            if date_for_injection:
                self.logger.info(f"Date for timestamp injection: {date_for_injection}")

            # Verify asset exists
            self.verify_asset_exists(file_info['symbol'])

            # Read CSV
            df = pd.read_csv(filepath)

            # Remove duplicate header rows (some CSVs have multiple header lines)
            if len(df) > 0 and df.iloc[0].astype(str).str.lower().isin(['timestamp', 'asset', 'price']).any():
                self.logger.info("Removing duplicate header row")
                df = df[df['timestamp'].astype(str).str.lower() != 'timestamp']
                df = df.reset_index(drop=True)

            # Inject date if needed (before validation)
            if date_for_injection:
                df = self.inject_date_into_timestamps(df, date_for_injection)

            # Validate CSV
            validation_errors = self.validate_csv_data(df, filepath)
            if validation_errors:
                error_msg = "; ".join(validation_errors)
                self.logger.error(f"❌ Validation failed: {error_msg}")

                self.log_ingestion_result(
                    file_info, filepath, len(df), 0, len(df),
                    time.time() - start_time, 'failed', error_msg
                )

                return {
                    'success': False,
                    'error': f"Validation failed: {error_msg}",
                    'file': filepath,
                    'records_total': len(df),
                    'records_processed': 0
                }

            # Prepare records
            records = self.prepare_records_for_insertion(df)

            # Insert in batches
            total_inserted = 0
            total_failed = 0

            for i in range(0, len(records), self.batch_size):
                batch = records[i:i + self.batch_size]
                batch_num = (i // self.batch_size) + 1
                
                inserted, failed = self.insert_batch_with_retry(batch, batch_num)
                total_inserted += inserted
                total_failed += failed

            # Log final results
            status = 'completed' if total_failed == 0 else 'partial'
            self.log_ingestion_result(
                file_info, filepath, len(df), total_inserted, total_failed,
                time.time() - start_time, status
            )

            return {
                'success': True,
                'file': filepath,
                'asset': file_info['symbol'],
                'records_total': len(df),
                'records_inserted': total_inserted,
                'records_failed': total_failed,
                'status': status
            }

        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            self.logger.error(f"❌ {error_msg}")
            
            self.log_ingestion_result(
                file_info if 'file_info' in locals() else {}, 
                filepath, 0, 0, 0,
                time.time() - start_time, 'error', error_msg
            )

            return {
                'success': False,
                'error': error_msg,
                'file': filepath,
                'records_total': 0,
                'records_processed': 0
            }


def main():
    """CLI entry point for tick data ingestion."""
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python -m backend.db_integrations.supabase_tick_ingestion <csv_file> [--symbol SYMBOL] [--date YYYY-MM-DD]")
        sys.exit(1)
    
    filepath = sys.argv[1]
    override_symbol = None
    override_date = None
    
    # Parse CLI arguments
    for i, arg in enumerate(sys.argv[2:], start=2):
        if arg == '--symbol' and i + 1 < len(sys.argv):
            override_symbol = sys.argv[i + 1]
        elif arg == '--date' and i + 1 < len(sys.argv):
            override_date = sys.argv[i + 1]
    
    ingestor = TickDataIngestion()
    result = ingestor.ingest_csv_file(filepath, override_symbol, override_date)
    
    sys.exit(0 if result['success'] else 1)


if __name__ == "__main__":
    main()
