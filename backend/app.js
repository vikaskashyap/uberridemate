/**
 * Express app definition — shared by the local server (server.js) and the
 * Vercel serverless handler (../api/index.js). No app.listen() here.
 */
const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/trusted-drivers', require('./routes/trustedDrivers'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/matching', require('./routes/matching'));
app.use('/api/rides', require('./routes/rides'));
app.use('/api', require('./routes/app'));

// Serve the frontend locally. On Vercel the static files are served from the CDN
// (see vercel.json rewrites), so this only runs in local/dev.
app.use('/', express.static(path.join(__dirname, '..', 'frontend')));

module.exports = app;
