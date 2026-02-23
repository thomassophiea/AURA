import { Hono } from "npm:hono@^4.12.1";
import { cors } from "npm:hono@^4.12.1/cors";
import { logger } from "npm:hono@^4.12.1/logger";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
const edgeAllowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

app.use(
  "/*",
  cors({
    origin: (origin) => edgeAllowedOrigins.includes(origin) ? origin : null,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Import the actual server logic from the server folder
// This acts as a proxy to maintain backward compatibility
const serverModule = await import("../server/index.tsx");

// Forward all requests to the server module
app.all("/*", async (c) => {
  return await serverModule.default.fetch(c.req.raw);
});

Deno.serve(app.fetch);
