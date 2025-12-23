#!/bin/bash

echo "╔════════════════════════════════════════════════════════════╗"
echo "║         Railway Worker Service Deployment                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Login to Railway (if needed)
echo "Step 1: Checking Railway authentication..."
if ! railway whoami &> /dev/null; then
    echo "Please login to Railway:"
    railway login
    if [ $? -ne 0 ]; then
        echo "❌ Railway login failed"
        exit 1
    fi
fi

echo "✅ Logged in to Railway"
echo ""

# Step 2: Link to project
echo "Step 2: Linking to Railway project..."
echo "Your Railway URL: edge-services-site-production.up.railway.app"
echo ""
echo "Please run this command manually to link to your project:"
echo "  railway link"
echo ""
echo "Then select your 'edge-services-site' project"
echo ""
read -p "Press Enter when you've linked the project..."

# Step 3: Check current services
echo ""
echo "Step 3: Checking existing services..."
railway status

# Step 4: Set environment variables for worker
echo ""
echo "Step 4: Setting environment variables for worker service..."
echo ""
echo "You'll need to add these variables in Railway dashboard:"
echo "https://railway.app/dashboard"
echo ""
echo "Required variables:"
echo "  CAMPUS_CONTROLLER_URL=https://tsophiea.ddns.net:443/management"
echo "  CAMPUS_CONTROLLER_USER=admin"
echo "  CAMPUS_CONTROLLER_PASSWORD=AHah1232!!*7"
echo "  VITE_SUPABASE_URL=https://ufqjnesldbacyltbsvys.supabase.co"
echo "  VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmcWpuZXNsZGJhY3lsdGJzdnlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3MjA4MTUsImV4cCI6MjA3NjI5NjgxNX0.9lZXSp3mRNb9h4Q0aO5wKouZ5yp8FVjotJunFF_bu4g"
echo "  COLLECTION_INTERVAL_MINUTES=30"
echo ""
echo "📋 Instructions:"
echo "1. Go to Railway dashboard: https://railway.app/dashboard"
echo "2. Open your 'edge-services-site' project"
echo "3. Click '+ New' to add a service"
echo "4. Select 'Empty Service'"
echo "5. Name it 'metrics-worker'"
echo "6. In Settings → Environment → Variables, add all the variables above"
echo "7. In Settings → Deploy, set:"
echo "   - Build Command: (leave empty)"
echo "   - Start Command: node metrics-collector.js"
echo "8. Connect to GitHub repo: thomassophiea/edge-services-site"
echo "9. Deploy!"
echo ""
echo "✅ Your worker will then run 24/7 collecting metrics every 30 minutes"
