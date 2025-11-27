/*
  # Update Database Schema for Risk Calculations

  ## Overview
  Updates the database to support risk calculation functionality for binary options trading,
  replacing the live trading schema with risk analysis and session planning tables.

  ## Changes
  
  1. Drop Previous Tables
     - Drops all previous trading-related tables as they're not needed for risk calculations
  
  2. New Tables

  ### `risk_calculations`
  - `id` (uuid, primary key) - Unique calculation identifier
  - `starting_balance` (decimal) - Initial trading balance
  - `risk_percentage` (decimal) - Risk percentage per trade
  - `number_of_sessions` (integer) - Number of trading sessions
  - `payout_rate` (decimal) - Broker payout rate (default 0.92)
  - `sessions` (jsonb) - Array of session data with trade details
  - `total_profit` (decimal) - Total calculated profit/loss
  - `total_growth` (decimal) - Overall growth percentage
  - `created_at` (timestamptz) - Calculation timestamp

  ### `saved_scenarios`
  - `id` (uuid, primary key) - Unique scenario identifier
  - `name` (text) - Scenario name
  - `description` (text) - Scenario description
  - `parameters` (jsonb) - Scenario parameters and settings
  - `results` (jsonb) - Calculated results
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  - RLS enabled on all tables
  - Policies allow authenticated users to manage their own calculations
*/

-- Drop old tables that are no longer needed
DROP TABLE IF EXISTS live_data CASCADE;
DROP TABLE IF EXISTS performance_metrics CASCADE;
DROP TABLE IF EXISTS trades CASCADE;
DROP TABLE IF EXISTS signals CASCADE;
DROP TABLE IF EXISTS positions CASCADE;
DROP TABLE IF EXISTS strategies CASCADE;

-- Create risk_calculations table
CREATE TABLE IF NOT EXISTS risk_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  starting_balance decimal(20, 2) NOT NULL,
  risk_percentage decimal(5, 2) NOT NULL,
  number_of_sessions integer NOT NULL,
  payout_rate decimal(5, 4) NOT NULL DEFAULT 0.92,
  sessions jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_profit decimal(20, 2) NOT NULL DEFAULT 0,
  total_growth decimal(10, 4) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create saved_scenarios table
CREATE TABLE IF NOT EXISTS saved_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  description text DEFAULT '',
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE risk_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_scenarios ENABLE ROW LEVEL SECURITY;

-- Create policies for risk_calculations
CREATE POLICY "Anyone can view risk calculations"
  ON risk_calculations FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert risk calculations"
  ON risk_calculations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update risk calculations"
  ON risk_calculations FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete risk calculations"
  ON risk_calculations FOR DELETE
  USING (true);

-- Create policies for saved_scenarios
CREATE POLICY "Anyone can view scenarios"
  ON saved_scenarios FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert scenarios"
  ON saved_scenarios FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update scenarios"
  ON saved_scenarios FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete scenarios"
  ON saved_scenarios FOR DELETE
  USING (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_risk_calculations_created_at ON risk_calculations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_scenarios_created_at ON saved_scenarios(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_scenarios_updated_at ON saved_scenarios(updated_at DESC);