#!/usr/bin/env python3
"""
Compile multiple candle CSV files into a single consolidated file.
Combines part files for a specific asset and creates a filename with date and time range.
"""

import argparse
import glob
import os
from pathlib import Path
from datetime import datetime
import re

def parse_timestamp(timestamp_str):
    """Parse timestamp from YYYY-MM-DD HH:MM:SSZ format to datetime object."""
    # Remove 'Z' suffix and parse as datetime
    datetime_str = timestamp_str.rstrip('Z')
    return datetime.strptime(datetime_str, '%Y-%m-%d %H:%M:%S')

def compile_candle_files(asset_name, part_range, input_dir=None, output_dir=None):
    """
    Compile multiple candle CSV files for a specific asset.

    Args:
        asset_name: Asset name (e.g., 'AEDCNY_otc')
        part_range: Range of parts to include (e.g., '1-5' or '001-005')
        input_dir: Directory containing the candle files (default: current dir)
        output_dir: Directory to save compiled file (default: same as input_dir)

    Returns:
        tuple: (output_path_str, list_of_matching_files) or (None, []) on failure
    """

    if input_dir is None:
        input_dir = Path.cwd()
    else:
        input_dir = Path(input_dir)

    if output_dir is None:
        output_dir = input_dir
    else:
        output_dir = Path(output_dir)

    # Parse part range
    if '-' in part_range:
        start_part, end_part = part_range.split('-')
        start_part = int(start_part)
        end_part = int(end_part)
    else:
        # Single part
        start_part = end_part = int(part_range)

    print(f"🔍 Looking for {asset_name} candle files parts {start_part} to {end_part}")

    # Find all matching files
    matching_files = []
    for part_num in range(start_part, end_part + 1):
        # Try different part number formats (001, 1, etc.)
        patterns = [
            f"{asset_name}_*_part{part_num:03d}.csv",
            f"{asset_name}_*_part{part_num}.csv"
        ]

        for pattern in patterns:
            files = list(input_dir.glob(pattern))
            if files:
                matching_files.extend(files)
                break  # Found a match for this part number

    # Remove duplicates and sort by part number
    matching_files = list(set(matching_files))
    matching_files.sort(key=lambda x: extract_part_number(x.name))

    if not matching_files:
        print(f"❌ No files found for {asset_name} parts {start_part}-{end_part}")
        return None, []

    print(f"📁 Found {len(matching_files)} files:")
    for f in matching_files:
        print(f"  - {f.name}")

    # Read and combine all data
    all_data = []
    first_timestamp = None
    last_timestamp = None

    for file_path in matching_files:
        print(f"📖 Reading {file_path.name}...")

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()

                # Skip header for all files except the first
                start_line = 1 if all_data else 0

                for line in lines[start_line:]:
                    line = line.strip()
                    if line:
                        parts = line.split(',')
                        if len(parts) >= 5 and parts[0] != 'timestamp':  # Skip header lines
                            timestamp_str, open_price, close_price, high_price, low_price = parts[0], parts[1], parts[2], parts[3], parts[4]

                            # Track time range
                            if first_timestamp is None:
                                first_timestamp = timestamp_str
                            last_timestamp = timestamp_str

                            all_data.append(line)

        except Exception as e:
            print(f"❌ Error reading {file_path.name}: {e}")
            continue

    if not all_data:
        print("❌ No data found in files")
        return None, []

    # Create output filename with date and time range
    # Extract date from first file name
    first_file = matching_files[0]
    date_match = re.search(r'_(\d{4}_\d{2}_\d{2})_', first_file.name)
    if date_match:
        date_str = date_match.group(1).replace('_', '')
    else:
        date_str = datetime.now().strftime('%Y%m%d')

    # Format time range (remove seconds for cleaner filename)
    if first_timestamp and last_timestamp:
        try:
            start_dt = parse_timestamp(first_timestamp)
            end_dt = parse_timestamp(last_timestamp)
            start_time = start_dt.strftime('%H%M')
            end_time = end_dt.strftime('%H%M')
        except:
            start_time = '0000'
            end_time = '2359'
    else:
        start_time = '0000'
        end_time = '2359'

    output_filename = f"{asset_name}_candles_{date_str}_{start_time}-{end_time}_compiled.csv"
    output_path = output_dir / output_filename

    # Write compiled data
    print(f"💾 Writing {len(all_data)} records to {output_filename}...")

    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            # Write header
            f.write("timestamp,open,close,high,low\n")

            # Write all data
            for line in all_data:
                f.write(line + '\n')

        print("✅ Compilation complete!")
        print(f"📊 Total records: {len(all_data)}")
        print(f"⏰ Time range: {first_timestamp} to {last_timestamp}")
        print(f"📁 Output: {output_path}")

        return str(output_path), matching_files

    except Exception as e:
        print(f"❌ Error writing output file: {e}")
        return None, []

def extract_part_number(filename):
    """Extract part number from filename for sorting."""
    match = re.search(r'_part(\d+)\.csv$', filename)
    return int(match.group(1)) if match else 0

def main():
    parser = argparse.ArgumentParser(
        description='Compile multiple candle CSV files into a single consolidated file',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python compile_candles_csv.py --asset AEDCNY_otc --part 1-5
  python compile_candles_csv.py --asset AEDCNY_otc EURUSD_otc USDTRY_otc --part 001-021
  python compile_candles_csv.py --asset GBPUSD_otc --part 001-010 --input-dir ./data/candles --output-dir ./compiled --delete-parts
  python compile_candles_csv.py --asset GBPUSD_otc --part 3 --delete-parts
        """
    )

    parser.add_argument(
        '--asset', '-a',
        nargs='+',
        required=True,
        help='Asset names (e.g., AEDCNY_otc EURUSD_otc USDTRY_otc)'
    )

    parser.add_argument(
        '--part', '-p',
        required=True,
        help='Part range to compile (e.g., 1-5, 001-005, or single number like 3)'
    )

    parser.add_argument(
        '--input-dir', '-i',
        help='Directory containing candle files (default: current directory)'
    )

    parser.add_argument(
        '--output-dir', '-o',
        help='Directory to save compiled file (default: same as input directory)'
    )

    parser.add_argument(
        '--delete-parts',
        action='store_true',
        help='Delete individual part files after successful compilation'
    )

    args = parser.parse_args()

    # Validate part range format
    if not re.match(r'^\d+(-\d+)?$', args.part):
        print("❌ Invalid part range format. Use: 1-5, 001-005, or single number like 3")
        return

    print("=" * 60)
    print("QuantumFlux Candle Data Compiler")
    print("=" * 60)

    success_count = 0
    total_assets = len(args.asset)

    for asset_name in args.asset:
        print(f"\n{'='*40}")
        print(f"Processing asset: {asset_name}")
        print(f"{'='*40}")

        result, matching_files = compile_candle_files(
            asset_name=asset_name,
            part_range=args.part,
            input_dir=args.input_dir,
            output_dir=args.output_dir
        )

        if result:
            success_count += 1
            print(f"\n🎉 Success! Compiled file: {result}")

            # Delete part files if requested
            if args.delete_parts and matching_files:
                print(f"🗑️  Deleting {len(matching_files)} part files...")
                deleted_count = 0
                for file_path in matching_files:
                    try:
                        os.remove(file_path)
                        print(f"  - Deleted: {file_path.name}")
                        deleted_count += 1
                    except Exception as e:
                        print(f"  - Failed to delete {file_path.name}: {e}")

                print(f"✅ Deleted {deleted_count}/{len(matching_files)} part files")
        else:
            print(f"\n❌ Compilation failed for {asset_name}!")

    print(f"\n{'='*60}")
    print(f"Summary: {success_count}/{total_assets} assets compiled successfully")
    if success_count < total_assets:
        exit(1)

if __name__ == '__main__':
    main()
