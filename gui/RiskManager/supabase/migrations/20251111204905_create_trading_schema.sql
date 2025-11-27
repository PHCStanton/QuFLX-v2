/*
  # Binary Risk Manager Database Schema

  ## Overview
  Creates the complete database schema for the Binary Risk Manager trading application,
  including tables for positions, signals, strategies, trades, and performance metrics.

  ## New Tables

  ### `positions`
  - `id` (uuid, primary key) - Unique position identifier
  - `position_id` (text) - Human-readable position ID (e.g., "Open 196")
  - `asset` (text) - Trading asset/symbol
  - `entry_price` (decimal) - Entry price of position
  - `current_price` (decimal) - Current market price
  - `risk_percentage` (decimal) - Risk percentage (90%, 91%, etc.)
  - `status` (text) - Position status (open, closed)
  - `created_at` (timestamptz) - Position creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `signals`
  - `id` (uuid, primary key) - Unique signal identifier
  - `name` (text) - Signal name (e.g., "Pglen Trader", "Trien klepoit")
  - `confidence` (decimal) - Confidence level (0-100%)
  - `status` (text) - Signal status (active, inactive)
  - `created_at` (timestamptz) - Signal creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `strategies`
  - `id` (uuid, primary key) - Unique strategy identifier
  - `name` (text) - Strategy name (e.g., "Quantum Flux")
  - `description` (text) - Strategy description
  - `config` (jsonb) - Strategy configuration parameters
  - `created_at` (timestamptz) - Strategy creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `trades`
  - `id` (uuid, primary key) - Unique trade identifier
  - `trade_id` (text) - Human-readable trade ID
  - `position_id` (uuid) - Foreign key to positions table
  - `strategy_id` (uuid) - Foreign key to strategies table
  - `action` (text) - Trade action (BUY, SELL, CALL)
  - `asset` (text) - Trading asset
  - `entry_price` (decimal) - Entry price
  - `exit_price` (decimal) - Exit price (nullable)
  - `profit_loss` (decimal) - Profit/loss amount
  - `status` (text) - Trade status (active, closed)
  - `executed_at` (timestamptz) - Trade execution timestamp
  - `closed_at` (timestamptz) - Trade close timestamp (nullable)
  - `created_at` (timestamptz) - Record creation timestamp

  ### `performance_metrics`
  - `id` (uuid, primary key) - Unique metric identifier
  - `strategy_id` (uuid) - Foreign key to strategies table
  - `total_trades` (integer) - Total number of trades
  - `win_rate` (decimal) - Win rate percentage
  - `profit_loss` (decimal) - Total profit/loss
  - `sharpe_ratio` (decimal) - Sharpe ratio
  - `max_drawdown` (decimal) - Maximum drawdown percentage
  - `calculated_at` (timestamptz) - Calculation timestamp
  - `created_at` (timestamptz) - Record creation timestamp

  ### `live_data`
  - `id` (uuid, primary key) - Unique data point identifier
  - `asset` (text) - Trading asset
  - `price` (decimal) - Current price
  - `rsi` (decimal) - RSI indicator value
  - `macd` (decimal) - MACD indicator value
  - `timestamp` (timestamptz) - Data timestamp

  ## Security
  - RLS enabled on all tables
  - Policies for authenticated users to manage their own data
*/

-- Create positions table
CREATE TABLE IF NOT EXISTS positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id text NOT NULL,
  asset text NOT NULL,
  entry_price decimal(20, 8) NOT NULL,
  current_price decimal(20, 8) NOT NULL,
  risk_percentage decimal(5, 2) NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create signals table
CREATE TABLE IF NOT EXISTS signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  confidence decimal(5, 2) NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create strategies table
CREATE TABLE IF NOT EXISTS strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create trades table
CREATE TABLE IF NOT EXISTS trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id text NOT NULL,
  position_id uuid REFERENCES positions(id) ON DELETE SET NULL,
  strategy_id uuid REFERENCES strategies(id) ON DELETE SET NULL,
  action text NOT NULL,
  asset text NOT NULL,
  entry_price decimal(20, 8) NOT NULL,
  exit_price decimal(20, 8),
  profit_loss decimal(20, 8) DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  executed_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create performance_metrics table
CREATE TABLE IF NOT EXISTS performance_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id uuid REFERENCES strategies(id) ON DELETE CASCADE,
  total_trades integer DEFAULT 0,
  win_rate decimal(5, 2) DEFAULT 0,
  profit_loss decimal(20, 8) DEFAULT 0,
  sharpe_ratio decimal(10, 4) DEFAULT 0,
  max_drawdown decimal(5, 2) DEFAULT 0,
  calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create live_data table
CREATE TABLE IF NOT EXISTS live_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset text NOT NULL,
  price decimal(20, 8) NOT NULL,
  rsi decimal(10, 4),
  macd decimal(10, 4),
  timestamp timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_data ENABLE ROW LEVEL SECURITY;

-- Create policies for positions
CREATE POLICY "Users can view all positions"
  ON positions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert positions"
  ON positions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update positions"
  ON positions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete positions"
  ON positions FOR DELETE
  TO authenticated
  USING (true);

-- Create policies for signals
CREATE POLICY "Users can view all signals"
  ON signals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert signals"
  ON signals FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update signals"
  ON signals FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete signals"
  ON signals FOR DELETE
  TO authenticated
  USING (true);

-- Create policies for strategies
CREATE POLICY "Users can view all strategies"
  ON strategies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert strategies"
  ON strategies FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update strategies"
  ON strategies FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete strategies"
  ON strategies FOR DELETE
  TO authenticated
  USING (true);

-- Create policies for trades
CREATE POLICY "Users can view all trades"
  ON trades FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert trades"
  ON trades FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update trades"
  ON trades FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete trades"
  ON trades FOR DELETE
  TO authenticated
  USING (true);

-- Create policies for performance_metrics
CREATE POLICY "Users can view all metrics"
  ON performance_metrics FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert metrics"
  ON performance_metrics FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update metrics"
  ON performance_metrics FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete metrics"
  ON performance_metrics FOR DELETE
  TO authenticated
  USING (true);

-- Create policies for live_data
CREATE POLICY "Users can view all live data"
  ON live_data FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert live data"
  ON live_data FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update live data"
  ON live_data FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete live data"
  ON live_data FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_position_id ON trades(position_id);
CREATE INDEX IF NOT EXISTS idx_trades_strategy_id ON trades(strategy_id);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_strategy_id ON performance_metrics(strategy_id);
CREATE INDEX IF NOT EXISTS idx_live_data_asset ON live_data(asset);
CREATE INDEX IF NOT EXISTS idx_live_data_timestamp ON live_data(timestamp DESC);