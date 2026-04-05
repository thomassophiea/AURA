/**
 * Rate Limiting Configuration
 * Protects against brute force and DDoS attacks
 */

export const rateLimitConfig = {
  // Authentication endpoints - strict limit
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: 'Too many login attempts, please try again later'
  },

  // General API endpoints - moderate limit
  api: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute per IP
    message: 'Too many requests, please slow down'
  },

  // Reporting endpoints - higher limit
  reporting: {
    windowMs: 60 * 1000,
    max: 300, // Allow more for report generation
    message: 'Rate limit exceeded for reporting'
  },

  // Real-time polling - adaptive
  polling: {
    windowMs: 1000, // 1 second window
    max: 10, // Max 10 requests per second
    adaptive: true // Can adjust based on load
  }
};
