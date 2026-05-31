const path = require('path');
const os = require('os');
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

// Serve the prototype frontend.
app.use('/', express.static(path.join(__dirname, '..', 'frontend')));

function lanAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  const lan = lanAddress();
  // eslint-disable-next-line no-console
  console.log(`\n  RideMate · Trusted Driver Pass`);
  console.log(`  ▸ This computer:  http://localhost:${PORT}`);
  if (lan) console.log(`  ▸ On your phone:  http://${lan}:${PORT}   (same Wi-Fi → open & "Add to Home Screen")`);
  console.log(`  ▸ API health:     http://localhost:${PORT}/api/me\n`);
});
