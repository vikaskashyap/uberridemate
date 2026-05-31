/** Local dev server. (On Vercel, ../api/index.js is the entry point instead.) */
const os = require('os');
const app = require('./app');

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
