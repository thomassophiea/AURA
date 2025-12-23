-- Table Preferences Schema
-- Supports universal customizable table columns feature
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. TABLE PREFERENCES
-- Stores user preferences for table customization
-- ============================================================================

CREATE TABLE IF NOT EXISTS table_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'user', -- 'user', 'site', 'network', 'global'
  visible_columns TEXT[] NOT NULL,
  column_order TEXT[],
  column_widths JSONB,
  pinned_columns TEXT[],
  current_view UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(table_id, user_id, scope)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_table_prefs_user
  ON table_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_table_prefs_table_user
  ON table_preferences(table_id, user_id);
CREATE INDEX IF NOT EXISTS idx_table_prefs_updated
  ON table_preferences(updated_at DESC);

-- Row Level Security
ALTER TABLE table_preferences ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own preferences" ON table_preferences
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own preferences" ON table_preferences
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own preferences" ON table_preferences
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own preferences" ON table_preferences
  FOR DELETE USING (auth.uid()::text = user_id);

-- ============================================================================
-- 2. TABLE VIEWS
-- Stores saved column views for tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS table_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  columns TEXT[] NOT NULL,
  column_widths JSONB,
  pinned_columns TEXT[],
  created_by TEXT NOT NULL,
  is_shared BOOLEAN DEFAULT FALSE,
  shared_with TEXT[],
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_table_views_table
  ON table_views(table_id);
CREATE INDEX IF NOT EXISTS idx_table_views_creator
  ON table_views(created_by);
CREATE INDEX IF NOT EXISTS idx_table_views_shared
  ON table_views(is_shared) WHERE is_shared = TRUE;
CREATE INDEX IF NOT EXISTS idx_table_views_default
  ON table_views(table_id, created_by, is_default) WHERE is_default = TRUE;

-- Row Level Security
ALTER TABLE table_views ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own views" ON table_views
  FOR SELECT USING (
    auth.uid()::text = created_by
    OR is_shared = TRUE
    OR auth.uid()::text = ANY(shared_with)
  );

CREATE POLICY "Users can create views" ON table_views
  FOR INSERT WITH CHECK (auth.uid()::text = created_by);

CREATE POLICY "Users can update their own views" ON table_views
  FOR UPDATE USING (auth.uid()::text = created_by);

CREATE POLICY "Users can delete their own views" ON table_views
  FOR DELETE USING (auth.uid()::text = created_by);

-- ============================================================================
-- 3. TABLE DEFINITIONS
-- Optional: Store table metadata and column definitions
-- ============================================================================

CREATE TABLE IF NOT EXISTS table_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  columns JSONB NOT NULL, -- Array of column definitions
  supports_views BOOLEAN DEFAULT TRUE,
  supports_export BOOLEAN DEFAULT TRUE,
  required_permissions TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_table_defs_table_id
  ON table_definitions(table_id);

-- Row Level Security
ALTER TABLE table_definitions ENABLE ROW LEVEL SECURITY;

-- Policies (read-only for all authenticated users)
CREATE POLICY "All users can view table definitions" ON table_definitions
  FOR SELECT USING (true);

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- Function to get user's preferences with fallback to defaults
CREATE OR REPLACE FUNCTION get_table_preferences(
  p_table_id TEXT,
  p_user_id TEXT,
  p_scope TEXT DEFAULT 'user'
)
RETURNS TABLE (
  visible_columns TEXT[],
  column_order TEXT[],
  column_widths JSONB,
  pinned_columns TEXT[],
  current_view UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tp.visible_columns,
    tp.column_order,
    tp.column_widths,
    tp.pinned_columns,
    tp.current_view
  FROM table_preferences tp
  WHERE tp.table_id = p_table_id
    AND tp.user_id = p_user_id
    AND tp.scope = p_scope;

  -- If no preferences found, return empty result
  -- Application will handle defaults
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get default view for a table
CREATE OR REPLACE FUNCTION get_default_view(
  p_table_id TEXT,
  p_user_id TEXT
)
RETURNS TABLE (
  view_id UUID,
  view_name TEXT,
  columns TEXT[],
  column_widths JSONB,
  pinned_columns TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tv.id,
    tv.name,
    tv.columns,
    tv.column_widths,
    tv.pinned_columns
  FROM table_views tv
  WHERE tv.table_id = p_table_id
    AND tv.created_by = p_user_id
    AND tv.is_default = TRUE
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old preferences (optional)
CREATE OR REPLACE FUNCTION cleanup_old_preferences(
  days_old INTEGER DEFAULT 365
)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM table_preferences
  WHERE updated_at < NOW() - (days_old || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. TRIGGERS
-- ============================================================================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_table_preferences_updated_at
  BEFORE UPDATE ON table_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_table_views_updated_at
  BEFORE UPDATE ON table_views
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_table_definitions_updated_at
  BEFORE UPDATE ON table_definitions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. INITIAL DATA (Optional)
-- ============================================================================

-- Insert table definitions for known tables
INSERT INTO table_definitions (table_id, name, description, columns, supports_views, supports_export) VALUES
  ('access_points', 'Access Points', 'Network access points', '[]'::jsonb, true, true),
  ('sites', 'Sites', 'Physical site locations', '[]'::jsonb, true, true),
  ('networks', 'Networks', 'Network configurations', '[]'::jsonb, true, true),
  ('clients', 'Clients', 'Connected client devices', '[]'::jsonb, true, true),
  ('wlans', 'WLANs', 'Wireless LAN configurations', '[]'::jsonb, true, true),
  ('vlans', 'VLANs', 'Virtual LAN configurations', '[]'::jsonb, true, true)
ON CONFLICT (table_id) DO NOTHING;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify tables created
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('table_preferences', 'table_views', 'table_definitions');

-- Verify indexes
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('table_preferences', 'table_views', 'table_definitions')
ORDER BY tablename, indexname;

-- Verify RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('table_preferences', 'table_views', 'table_definitions');
