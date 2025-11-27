/*
  # Add Balance Tracking to Trading Days

  ## Overview
  Adds starting and ending balance fields to the trading_days table to track
  account balance evolution across trading sessions. This allows users to:
  - Track their actual account balance from Pocket Option
  - Manually adjust balances when they differ from calculated values
  - Account for multiple simultaneous trades or rounding differences
  
  ## Changes
  
  1. New Columns
    - `starting_balance` (decimal) - Account balance at the start of the trading day
    - `ending_balance` (decimal) - Account balance at the end of the trading day
    - Both fields are nullable to support existing data
  
  2. Notes
    - Starting balance defaults to NULL for backward compatibility
    - Ending balance defaults to NULL for backward compatibility
    - Users can manually edit these values to match their platform's actual balances
    - This solves discrepancies from:
      * Decimal precision differences in calculations
      * Multiple simultaneous trades
      * Platform-specific rounding
*/

-- Add balance tracking columns to trading_days
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trading_days' AND column_name = 'starting_balance'
  ) THEN
    ALTER TABLE trading_days ADD COLUMN starting_balance decimal(20, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trading_days' AND column_name = 'ending_balance'
  ) THEN
    ALTER TABLE trading_days ADD COLUMN ending_balance decimal(20, 2);
  END IF;
END $$;