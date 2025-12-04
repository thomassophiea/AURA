import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
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
