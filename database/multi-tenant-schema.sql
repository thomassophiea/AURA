-- Multi-Tenant Schema for API | Integration ONE
-- Run this in your Supabase SQL Editor

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Controllers table (Platform ONE instances)
CREATE TABLE IF NOT EXISTS controllers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  port INTEGER DEFAULT 443,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  last_connected_at TIMESTAMPTZ,
  connection_status TEXT DEFAULT 'unknown', -- connected, disconnected, error, unknown
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  settings JSONB DEFAULT '{}',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User-Organization relationships with roles
CREATE TABLE IF NOT EXISTS user_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer', -- owner, admin, operator, viewer
  invited_by UUID REFERENCES user_profiles(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, org_id)
);

-- User's last selected controller per organization
CREATE TABLE IF NOT EXISTS user_controller_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  controller_id UUID REFERENCES controllers(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, org_id)
);

-- Controller credentials (encrypted storage)
CREATE TABLE IF NOT EXISTS controller_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  controller_id UUID NOT NULL REFERENCES controllers(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL DEFAULT 'oauth2', -- oauth2, api_key, basic
  username TEXT,
  -- Note: In production, use Supabase Vault for sensitive data
  encrypted_password TEXT,
  api_key TEXT,
  oauth_client_id TEXT,
  oauth_client_secret TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(controller_id)
);

-- Audit log for multi-tenant actions
CREATE TABLE IF NOT EXISTS tenant_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  controller_id UUID REFERENCES controllers(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_controllers_org_id ON controllers(org_id);
CREATE INDEX IF NOT EXISTS idx_user_organizations_user_id ON user_organizations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_organizations_org_id ON user_organizations(org_id);
CREATE INDEX IF NOT EXISTS idx_tenant_audit_log_org_id ON tenant_audit_log(org_id);
CREATE INDEX IF NOT EXISTS idx_tenant_audit_log_user_id ON tenant_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_audit_log_created_at ON tenant_audit_log(created_at DESC);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE controllers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_controller_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE controller_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_audit_log ENABLE ROW LEVEL SECURITY;

-- Organizations: Users can see orgs they belong to
CREATE POLICY "Users can view their organizations" ON organizations
  FOR SELECT USING (
    id IN (
      SELECT org_id FROM user_organizations 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Controllers: Users can see controllers in their orgs
CREATE POLICY "Users can view controllers in their orgs" ON controllers
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_organizations 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Admins can manage controllers
CREATE POLICY "Admins can manage controllers" ON controllers
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_organizations 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin') 
      AND is_active = true
    )
  );

-- User profiles: Users can view and update their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- User organizations: Users can see their own memberships
CREATE POLICY "Users can view own memberships" ON user_organizations
  FOR SELECT USING (user_id = auth.uid());

-- User controller preferences: Users can manage their own preferences
CREATE POLICY "Users can manage own preferences" ON user_controller_preferences
  FOR ALL USING (user_id = auth.uid());

-- Audit log: Users can view logs for their orgs
CREATE POLICY "Users can view audit logs for their orgs" ON tenant_audit_log
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_organizations 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Functions

-- Function to create a new organization with the creator as owner
CREATE OR REPLACE FUNCTION create_organization_with_owner(
  org_name TEXT,
  org_slug TEXT,
  owner_id UUID
) RETURNS UUID AS $$
DECLARE
  new_org_id UUID;
BEGIN
  -- Create the organization
  INSERT INTO organizations (name, slug)
  VALUES (org_name, org_slug)
  RETURNING id INTO new_org_id;
  
  -- Add the creator as owner
  INSERT INTO user_organizations (user_id, org_id, role, accepted_at)
  VALUES (owner_id, new_org_id, 'owner', NOW());
  
  RETURN new_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add a controller to an organization
CREATE OR REPLACE FUNCTION add_controller_to_org(
  p_org_id UUID,
  p_name TEXT,
  p_url TEXT,
  p_description TEXT DEFAULT NULL,
  p_is_default BOOLEAN DEFAULT false
) RETURNS UUID AS $$
DECLARE
  new_controller_id UUID;
BEGIN
  -- If this is set as default, unset other defaults in the org
  IF p_is_default THEN
    UPDATE controllers SET is_default = false WHERE org_id = p_org_id;
  END IF;
  
  -- Create the controller
  INSERT INTO controllers (org_id, name, url, description, is_default)
  VALUES (p_org_id, p_name, p_url, p_description, p_is_default)
  RETURNING id INTO new_controller_id;
  
  RETURN new_controller_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_controllers_updated_at
  BEFORE UPDATE ON controllers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
