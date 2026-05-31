const express = require('express');
const { store } = require('../db/store');
const { evaluate, atLimit, activeCount, MAX_TRUSTED_DRIVERS } = require('../services/eligibility');

const router = express.Router();

// GET /api/me — the signed-in rider + slot usage
router.get('/me', (req, res) => {
  const rider = store.users.find((u) => u.id === store.currentRiderId);
  res.json({
    rider,
    trusted: { count: activeCount(rider.id), max: MAX_TRUSTED_DRIVERS, atLimit: atLimit(rider.id) },
  });
});

// GET /api/drivers — all drivers with eligibility for the current rider
router.get('/drivers', (req, res) => {
  const riderId = store.currentRiderId;
  const trustedIds = new Set(
    store.trustedDrivers.filter((t) => t.riderId === riderId && t.status !== 'removed').map((t) => t.driverId)
  );
  const drivers = store.drivers.map((d) => ({
    id: d.id, name: d.name, photo: d.photo, rating: d.rating, vehicle: d.vehicle,
    online: d.online, ridesWithRider: d.ridesWithRider, optedIn: d.optedIn,
    isTrusted: trustedIds.has(d.id),
    eligibility: evaluate(riderId, d.id),
  }));
  res.json({ drivers });
});

// GET /api/places — saved + recent destinations for the picker
router.get('/places', (req, res) => {
  res.json({ places: store.places, rider: store.users.find((u) => u.id === store.currentRiderId) });
});

// GET /api/notifications — in-app activity feed
router.get('/notifications', (req, res) => {
  res.json({ notifications: store.notifications.slice(0, 20) });
});

// POST /api/drivers/:id/toggle-online — demo helper to exercise matching fallbacks
router.post('/drivers/:id/toggle-online', (req, res) => {
  const d = store.drivers.find((x) => x.id === req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  d.online = typeof req.body.online === 'boolean' ? req.body.online : !d.online;
  res.json({ id: d.id, online: d.online });
});

module.exports = router;
