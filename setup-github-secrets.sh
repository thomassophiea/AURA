#!/bin/bash

# GitHub Actions Secrets Setup Script
# This will configure all required secrets for the metrics collector

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     GitHub Actions Secrets Setup                          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed"
    echo ""
    echo "Please install it:"
    echo "  macOS: brew install gh"
    echo "  Linux: See https://github.com/cli/cli#installation"
    echo ""
    echo "Or add secrets manually at:"
    echo "https://github.com/thomassophiea/edge-services-site/settings/secrets/actions"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "⚠️  Not authenticated with GitHub"
    echo "Running: gh auth login"
    gh auth login
fi

echo "📝 Setting up secrets for: thomassophiea/edge-services-site"
echo ""

# Set secrets
echo "Setting CAMPUS_CONTROLLER_URL..."
echo "https://tsophiea.ddns.net:443/management" | gh secret set CAMPUS_CONTROLLER_URL -R thomassophiea/edge-services-site

echo "Setting CAMPUS_CONTROLLER_USER..."
echo "admin" | gh secret set CAMPUS_CONTROLLER_USER -R thomassophiea/edge-services-site

echo "Setting CAMPUS_CONTROLLER_PASSWORD..."
echo "AHah1232!!*7" | gh secret set CAMPUS_CONTROLLER_PASSWORD -R thomassophiea/edge-services-site

echo "Setting SUPABASE_URL..."
echo "https://ufqjnesldbacyltbsvys.supabase.co" | gh secret set SUPABASE_URL -R thomassophiea/edge-services-site

echo "Setting SUPABASE_ANON_KEY..."
echo "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmcWpuZXNsZGJhY3lsdGJzdnlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3MjA4MTUsImV4cCI6MjA3NjI5NjgxNX0.9lZXSp3mRNb9h4Q0aO5wKouZ5yp8FVjotJunFF_bu4g" | gh secret set SUPABASE_ANON_KEY -R thomassophiea/edge-services-site

echo ""
echo "✅ All secrets have been set!"
echo ""
echo "📋 Next steps:"
echo "1. Go to: https://github.com/thomassophiea/edge-services-site/actions"
echo "2. Find 'Network Metrics Collection' workflow"
echo "3. Click 'Enable workflow' if disabled"
echo "4. Click 'Run workflow' to test"
echo ""
echo "The workflow will run every 30 minutes automatically."
