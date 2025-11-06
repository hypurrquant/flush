-- Supabase table schema for swaps tracking
-- Run this SQL in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS swaps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_address TEXT NOT NULL,
  total_swap_amount TEXT NOT NULL,
  fees TEXT NOT NULL DEFAULT '0',
  token_addresses TEXT[],
  amounts TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_swaps_user_address ON swaps(user_address);
CREATE INDEX IF NOT EXISTS idx_swaps_created_at ON swaps(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE swaps ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read their own data
CREATE POLICY "Users can read their own swaps"
  ON swaps FOR SELECT
  USING (true); -- Adjust based on your auth requirements

-- Create policy to allow inserts
CREATE POLICY "Anyone can insert swaps"
  ON swaps FOR INSERT
  WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_swaps_updated_at BEFORE UPDATE ON swaps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


