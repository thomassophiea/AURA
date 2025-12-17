# Proxy Server Setup

This project includes a backend proxy server to handle CORS issues when communicating with the Campus Controller API.

## Architecture

```
Browser → Railway (Express Proxy) → Campus Controller
                ↓
            React App (served as static files)
```

## How It Works

1. **Production Mode**:
   - The Express server (`server.js`) runs on Railway
   - All API requests go to `/api/*` which are proxied to the Campus Controller
   - React app is served as static files from the `dist` folder
   - CORS headers are added by the proxy server

2. **Development Mode**:
   - Run `npm run dev` to start Vite dev server
   - API requests go directly to Campus Controller (localhost bypass)
   - No proxy needed for local development

## Files

- `server.js` - Express proxy server that handles CORS and serves static files
- `package.json` - Updated with Express dependencies
- `railway.toml` - Railway deployment configuration
- `Procfile` - Process configuration for Railway
- `src/services/api.ts` - Updated to use proxy in production

## Environment Variables

Create a `.env` file (or set in Railway dashboard):

```bash
CAMPUS_CONTROLLER_URL=https://tsophiea.ddns.net
PORT=3000  # Railway sets this automatically
```

## Deployment

### Automatic (Railway)

1. Push changes to GitHub
2. Railway automatically builds and deploys
3. The proxy server starts automatically

### Manual Testing

```bash
# Install dependencies
npm install

# Build the React app
npm run build

# Start the proxy server
npm start

# Server will be available at http://localhost:3000
```

## API Route Mapping

| Frontend Request | Proxy Route | Campus Controller |
|-----------------|-------------|-------------------|
| `/api/management/v1/services` | → | `https://tsophiea.ddns.net/management/v1/services` |
| `/api/management/v1/applications` | → | `https://tsophiea.ddns.net/management/v1/applications` |
| `/api/management/v3/sites` | → | `https://tsophiea.ddns.net/management/v3/sites` |

## Troubleshooting

### CORS Errors Still Appearing

1. Check that you're on the Railway deployment URL
2. Verify the proxy server is running (check logs)
3. Confirm `CAMPUS_CONTROLLER_URL` environment variable is set correctly

### Proxy Not Working

1. Check Railway logs: `railway logs`
2. Verify build completed successfully
3. Test health endpoint: `https://your-app.railway.app/health`

### Development Issues

If direct API calls fail in development:
- The Campus Controller needs to allow CORS from `localhost`
- Or use the proxy in development too by setting `isProduction = true` in `api.ts`

## Health Check

The proxy includes a health check endpoint:

```bash
curl https://your-app.railway.app/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Logs

The proxy server logs all requests:

```
[Proxy Server] Starting...
[Proxy Server] Target: https://tsophiea.ddns.net
[Proxy Server] Port: 3000
[Proxy] GET /api/management/v1/services -> https://tsophiea.ddns.net/management/v1/services
[Proxy] GET /api/management/v1/services <- 200
```

## Security Notes

- The proxy accepts self-signed certificates (`secure: false`)
- CORS is enabled for all origins in development
- For production, consider restricting CORS to specific origins
- Authentication tokens are forwarded from the browser to Campus Controller
