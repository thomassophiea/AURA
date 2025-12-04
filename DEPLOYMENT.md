# Deployment Guide

This guide will help you deploy the edge-services-site to GitHub and Railway.

## Prerequisites

- GitHub account
- Railway account (sign up at https://railway.app)
- Git installed locally

## Step 1: Push to GitHub

### Create a new repository on GitHub

1. Go to https://github.com/new
2. Repository name: `edge-services-site` (or your preferred name)
3. Choose public or private
4. **Do NOT** initialize with README, .gitignore, or license (we already have these)
5. Click "Create repository"

### Connect and push your local repository

```bash
# Add GitHub as remote origin (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/edge-services-site.git

# Push to GitHub
git push -u origin main
```

## Step 2: Deploy to Railway

### Option A: Deploy via Railway Dashboard (Recommended)

1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Authorize Railway to access your GitHub account (if not already done)
5. Select the `edge-services-site` repository
6. Railway will automatically:
   - Detect it's a Node.js project
   - Read the `railway.toml` configuration
   - Run `npm install` and `npm run build`
   - Start the app using the command specified in `railway.toml`

### Option B: Deploy via Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init

# Deploy
railway up
```

## Step 3: Configure Environment Variables (if needed)

If your app requires environment variables:

1. In Railway dashboard, go to your project
2. Click on "Variables" tab
3. Add your environment variables (e.g., API keys, database URLs)

## Step 4: Access Your Application

Once deployed, Railway will provide you with a URL like:
```
https://your-app-name.up.railway.app
```

You can find this URL in the Railway dashboard under "Settings" → "Domains"

## Configuration Files Added

- **railway.toml**: Railway deployment configuration
  - Uses nixpacks builder (auto-detects Node.js)
  - Serves static files from `build` directory using `serve` package
  - Configured restart policy for reliability

- **package.json**: Updated with:
  - `serve` package for static file serving
  - `start` script for production deployment

- **.gitignore**: Updated to exclude `build` directory

## Local Testing

To test the production build locally:

```bash
# Install dependencies
npm install

# Build the app
npm run build

# Start the production server
npm start
```

Visit http://localhost:3000 to see your app running locally.

## Troubleshooting

### Build fails on Railway
- Check the build logs in Railway dashboard
- Ensure all dependencies are listed in `package.json`
- Verify the build command works locally: `npm run build`

### App fails to start
- Check that the `build` directory exists after building
- Verify the start command in `railway.toml` matches your setup
- Check Railway logs for error messages

### Need to update deployment
Simply push changes to GitHub:
```bash
git add .
git commit -m "Your changes"
git push
```

Railway will automatically rebuild and redeploy.

## Additional Resources

- [Railway Documentation](https://docs.railway.app)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)
- [GitHub Documentation](https://docs.github.com)
