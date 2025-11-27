#!/usr/bin/env python3
"""
Redis Batch Processor for QuFLX Trading Platform

Handles batch processing of Redis tick data to Supabase.
Runs at configurable intervals to persist data efficiently.
"""

import time
import threading
import logging
from typing import Dict, List, Any
from datetime import datetime, timezone
from collections import defaultdict
from .redis_integration import RedisIntegration
from .supabase_data_queries import SupabaseDataQueries
from config.redis_config import BATCH_PROCESSING_INTERVAL

class RedisBatchProcessor:
    """
    Batch processor for moving Redis tick data to Supabase.
    """
    
    def __init__(self, redis_integration: RedisIntegration, supabase_queries: SupabaseDataQueries):
        """
        Initialize batch processor with MCP-based integrations.
        
        Args:
            redis_integration: MCP-based Redis integration instance
            supabase_queries: MCP-based Supabase queries instance
        """
        self.redis_integration = redis_integration
        self.supabase_queries = supabase_queries
        self.logger = logging.getLogger(__name__)
        self.processing_thread = None
        self.stop_event = threading.Event()
        self.active_assets = set()
        self.last_processed_times = {}
    
    def start_processing(self):
        """Start batch processing thread."""
        if self.processing_thread and self.processing_thread.is_alive():
            self.logger.warning("Batch processing already running")
            return
        
        self.stop_event.clear()
        self.processing_thread = threading.Thread(target=self._processing_loop, daemon=True)
        self.processing_thread.start()
        self.logger.info("✅ Redis batch processing started")
    
    def stop_processing(self):
        """Stop batch processing thread."""
        if self.processing_thread:
            self.stop_event.set()
            self.processing_thread.join(timeout=5)
            self.logger.info("⏹️ Redis batch processing stopped")
    
    def register_asset(self, asset: str):
        """
        Register an asset for batch processing.
        
        Args:
            asset: Asset symbol to process
        """
        self.active_assets.add(asset)
        self.logger.info(f"Registered asset for batch processing: {asset}")
    
    def unregister_asset(self, asset: str):
        """
        Unregister an asset from batch processing.
        
        Args:
            asset: Asset symbol to stop processing
        """
        self.active_assets.discard(asset)
        self.logger.info(f"Unregistered asset from batch processing: {asset}")
    
    def _processing_loop(self):
        """Main processing loop running in background thread."""
        while not self.stop_event.is_set():
            try:
                start_time = time.time()
                
                # Process all active assets
                for asset in list(self.active_assets):
                    self._process_asset_ticks(asset)
                
                # Calculate processing time
                processing_time = time.time() - start_time
                
                # Sleep for remaining time in interval
                sleep_time = max(0, BATCH_PROCESSING_INTERVAL - processing_time)
                if sleep_time > 0:
                    self.stop_event.wait(sleep_time)
                
            except Exception as e:
                self.logger.error(f"Error in batch processing loop: {e}")
                self.stop_event.wait(5)  # Wait 5 seconds before retrying
    
    def _process_asset_ticks(self, asset: str):
        """
        Process ticks for a specific asset.
        
        Args:
            asset: Asset symbol to process
        """
        try:
            # Get ticks from Redis buffer
            ticks = self.redis_integration.get_ticks_from_buffer(asset)
            
            if not ticks:
                return  # No ticks to process

            # Sort ticks by timestamp to ensure order
            ticks.sort(key=lambda x: int(x.get('timestamp', 0)))
            
            # Convert to Supabase format
            supabase_records = self._convert_ticks_to_supabase_format(asset, ticks)
            
            # Insert into Supabase
            result = self._insert_ticks_to_supabase(supabase_records)
            
            if result['success']:
                self.logger.info(f"✅ Processed {len(ticks)} ticks for {asset}")
                self.last_processed_times[asset] = datetime.now(timezone.utc)
            else:
                self.logger.error(f"❌ Failed to process ticks for {asset}: {result.get('error')}")

            # Process and insert candles
            candle_result = self._process_and_insert_candles(asset, ticks)
            if candle_result['success']:
                self.logger.info(f"✅ Processed {candle_result['processed_count']} candles for {asset}")
            else:
                self.logger.error(f"❌ Failed to process candles for {asset}: {candle_result.get('error')}")
                
        except Exception as e:
            self.logger.error(f"Error processing ticks for {asset}: {e}")
    
    def _convert_ticks_to_supabase_format(self, asset: str, ticks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Convert tick data to Supabase format.
        
        Args:
            asset: Asset symbol
            ticks: List of tick data
            
        Returns:
            List of Supabase records
        """
        records = []
        for tick in ticks:
            record = {
                'pair': asset,
                'price': float(tick.get('price', tick.get('close', 0))),
                'timestamp': int(tick.get('timestamp', time.time()))
            }
            records.append(record)
        
        return records
    
    def _insert_ticks_to_supabase(self, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Insert tick records into Supabase using the MCP.
        
        Args:
            records: List of tick records
            
        Returns:
            Result dictionary with success status
        """
        if not records:
            return {'success': True, 'inserted_count': 0}

        try:
            # Prepare data for execute_many
            data = [
                (rec['pair'], rec['price'], rec['timestamp'])
                for rec in records
            ]
            
            # Define the insert query with conflict handling
            query = "INSERT INTO historical_ticks (pair, price, timestamp) VALUES %s ON CONFLICT (pair, timestamp) DO NOTHING;"

            # Execute via SupabaseDataQueries
            self.supabase_queries.execute_many(query, data)
            
            return {
                'success': True,
                'inserted_count': len(records)  # Note: actual inserts may be less due to conflicts
            }
            
        except Exception as e:
            self.logger.error(f"Direct Supabase insert failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _process_and_insert_candles(self, asset: str, ticks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Aggregate ticks into 1-minute candles and insert/update in Supabase.
        
        Args:
            asset: Asset symbol
            ticks: List of tick data (assumed sorted by timestamp)
            
        Returns:
            Result dictionary with success status
        """
        if not ticks:
            return {'success': True, 'processed_count': 0}

        try:
            candles = defaultdict(lambda: {
                'open': None,
                'high': float('-inf'),
                'low': float('inf'),
                'close': None,
                'volume': 0
            })

            for tick in ticks:
                ts = int(tick.get('timestamp', 0))
                price = float(tick.get('price', tick.get('close', 0)))
                minute_start = (ts // 60) * 60

                c = candles[minute_start]
                if c['open'] is None:
                    c['open'] = price
                c['high'] = max(c['high'], price)
                c['low'] = min(c['low'], price)
                c['close'] = price
                c['volume'] += 1  # Volume as tick count

            processed = 0
            for minute_start, c in candles.items():
                query = f"""
                INSERT INTO candles (pair, timeframe, open_price, high_price, low_price, close_price, volume, timestamp)
                VALUES ('{asset}', '1m', {c['open']}, {c['high']}, {c['low']}, {c['close']}, {c['volume']}, {minute_start})
                ON CONFLICT (pair, timeframe, timestamp) DO UPDATE SET
                    high_price = GREATEST(candles.high_price, EXCLUDED.high_price),
                    low_price = LEAST(candles.low_price, EXCLUDED.low_price),
                    close_price = EXCLUDED.close_price,
                    volume = candles.volume + EXCLUDED.volume
                """
                self.supabase_queries.execute_query(query)
                processed += 1

            return {'success': True, 'processed_count': processed}

        except Exception as e:
            self.logger.error(f"Error processing candles for {asset}: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_processing_status(self) -> Dict[str, Any]:
        """
        Get current processing status.
        
        Returns:
            Dictionary with processing status
        """
        status = {
            'is_running': self.processing_thread and self.processing_thread.is_alive(),
            'active_assets': list(self.active_assets),
            'last_processed_times': self.last_processed_times.copy(),
            'buffer_sizes': {}
        }
        
        # Get buffer sizes for all active assets
        for asset in self.active_assets:
            status['buffer_sizes'][asset] = self.redis_integration.get_buffer_size(asset)
        
        return status
    
    def force_process_asset(self, asset: str) -> Dict[str, Any]:
        """
        Force immediate processing of ticks for an asset.
        
        Args:
            asset: Asset symbol to process
            
        Returns:
            Result dictionary
        """
        try:
            self._process_asset_ticks(asset)
            return {
                'success': True,
                'message': f"Force processed ticks for {asset}"
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }