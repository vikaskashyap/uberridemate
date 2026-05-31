/**
 * Vercel serverless entry point.
 *
 * All /api/* requests are routed here (see vercel.json). The Express app is a
 * standard (req, res) handler, which Vercel invokes directly.
 *
 * Note: the in-memory store lives in this function instance's memory. State is
 * consistent while the instance is warm, and resets to the seed on a cold start.
 */
const app = require('../backend/app');

module.exports = app;
