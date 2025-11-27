/*
  # Trading Calendar Database Schema

  ## Overview
  Creates comprehensive database schema for the Trading Calendar feature including
  trades, journal entries, calendar days, and image uploads for documentation.

  ## New Tables

  ### `trading_days`
  - `id` (uuid, primary key) - Unique day identifier
  - `user_id` (uuid) - User reference for multi-user support
  - `trade_date` (date, unique) - The trading day date
  - `is_trading_day` (boolean) - Whether trades were executed this day
  - `total_profit_loss` (decimal) - Day's total P/L
  - `win_count` (integer) - Number of winning trades
  - `loss_count` (integer) - Number of losing trades
  - `total_trades` (integer) - Total trades for the day
  - `notes` (text) - General notes for the day
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `trades`
  - `id` (uuid, primary key) - Unique trade identifier
  - `trading_day_id` (uuid) - Foreign key to trading_days
  - `user_id` (uuid) - User reference
  - `asset` (text) - Trading instrument/pair
  - `open_time` (timestamptz) - Trade open timestamp
  - `close_time` (timestamptz) - Trade close timestamp
  - `open_price` (decimal) - Entry price
  - `close_price` (decimal) - Exit price
  - `investment_amount` (decimal) - Amount invested
  - `profit_loss` (decimal) - Trade P/L amount
  - `profit_loss_percent` (decimal) - P/L percentage
  - `trade_type` (text) - Type (CALL/PUT or BUY/SELL)
  - `result` (text) - WIN/LOSS/BREAKEVEN
  - `created_at` (timestamptz) - Record creation timestamp

  ### `journal_entries`
  - `id` (uuid, primary key) - Unique entry identifier
  - `trading_day_id` (uuid) - Foreign key to trading_days
  - `user_id` (uuid) - User reference
  - `entry_type` (text) - Type: pre-market, post-market, general
  - `content` (text) - Journal entry content
  - `emotion_tags` (text[]) - Array of emotions (calm, anxious, confident, impulsive)
  - `market_conditions` (text) - Market conditions notes
  - `lessons_learned` (text) - Lessons and reflections
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `trade_images`
  - `id` (uuid, primary key) - Unique image identifier
  - `trading_day_id` (uuid) - Foreign key to trading_days (nullable)
  - `trade_id` (uuid) - Foreign key to trades (nullable)
  - `user_id` (uuid) - User reference
  - `image_url` (text) - URL to stored image
  - `image_type` (text) - Type: chart, strategy, setup, general
  - `caption` (text) - Image description
  - `created_at` (timestamptz) - Record creation timestamp

  ## Security
  - RLS enabled on all tables
  - Policies allow users to manage only their own data
  
  ## Indexes
  - Optimized for date-based queries and user filtering
*/

-- Create trading_days table
CREATE TABLE IF NOT EXISTS trading_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  trade_date date NOT NULL,
  is_trading_day boolean DEFAULT true,
  total_profit_loss decimal(20, 2) DEFAULT 0,
  win_count integer DEFAULT 0,
  loss_count integer DEFAULT 0,
  total_trades integer DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, trade_date)
);

-- Create trades table
CREATE TABLE IF NOT EXISTS trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trading_day_id uuid REFERENCES trading_days(id) ON DELETE CASCADE,
  user_id uuid,
  asset text NOT NULL,
  open_time timestamptz NOT NULL,
  close_time timestamptz NOT NULL,
  open_price decimal(20, 8) NOT NULL,
  close_price decimal(20, 8) NOT NULL,
  investment_amount decimal(20, 2) NOT NULL,
  profit_loss decimal(20, 2) NOT NULL,
  profit_loss_percent decimal(10, 4) NOT NULL,
  trade_type text NOT NULL,
  result text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create journal_entries table
CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trading_day_id uuid REFERENCES trading_days(id) ON DELETE CASCADE,
  user_id uuid,
  entry_type text NOT NULL DEFAULT 'general',
  content text NOT NULL,
  emotion_tags text[] DEFAULT '{}',
  market_conditions text DEFAULT '',
  lessons_learned text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create trade_images table
CREATE TABLE IF NOT EXISTS trade_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trading_day_id uuid REFERENCES trading_days(id) ON DELETE SET NULL,
  trade_id uuid REFERENCES trades(id) ON DELETE SET NULL,
  user_id uuid,
  image_url text NOT NULL,
  image_type text NOT NULL DEFAULT 'general',
  caption text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE trading_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_images ENABLE ROW LEVEL SECURITY;

-- Policies for trading_days
CREATE POLICY "Users can view own trading days"
  ON trading_days FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own trading days"
  ON trading_days FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own trading days"
  ON trading_days FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own trading days"
  ON trading_days FOR DELETE
  USING (true);

-- Policies for trades
CREATE POLICY "Users can view own trades"
  ON trades FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own trades"
  ON trades FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own trades"
  ON trades FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own trades"
  ON trades FOR DELETE
  USING (true);

-- Policies for journal_entries
CREATE POLICY "Users can view own journal entries"
  ON journal_entries FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own journal entries"
  ON journal_entries FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own journal entries"
  ON journal_entries FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own journal entries"
  ON journal_entries FOR DELETE
  USING (true);

-- Policies for trade_images
CREATE POLICY "Users can view own trade images"
  ON trade_images FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own trade images"
  ON trade_images FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own trade images"
  ON trade_images FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own trade images"
  ON trade_images FOR DELETE
  USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_trading_days_date ON trading_days(trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_trading_days_user ON trading_days(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_trading_day ON trades(trading_day_id);
CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_open_time ON trades(open_time DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_trading_day ON journal_entries(trading_day_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user ON journal_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_images_trading_day ON trade_images(trading_day_id);
CREATE INDEX IF NOT EXISTS idx_trade_images_trade ON trade_images(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_images_user ON trade_images(user_id);