const express = require('express');
const { store, nextId } = require('../db/store');
const { evaluate, atLimit, activeCount, MAX_TRUSTED_DRIVERS } = require('../services/eligibility');
const { notify } = require('../services/notifications');

const router = express.Router();

const driverById = (id) => store.drivers.find((d) => d.id === id);
const riderById = (id) => store.users.find((u) => u.id === id);

// Hydrate a TrustedDriver row with its driver profile for the UI.
function hydrate(t) {
  const d = driverById(t.driverId) || {};
  const sub = store.subscriptions.find(
    (s) => s.riderId === t.riderId && s.driverId === t.driverId && s.status === 'active'
  );
  return {
    id: t.id,
    status: t.status,
    isPrimary: !!t.isPrimary,
    createdAt: t.createdAt,
    acceptedAt: t.acceptedAt,
    driver: {
      id: d.id, name: d.name, photo: d.photo, rating: d.rating,
      vehicle: d.vehicle, online: d.online, ridesWithRider: d.ridesWithRider,
      availabilitySet: d.availabilitySet,
    },
    subscription: sub ? { id: sub.id, status: sub.status, discountedPrice: sub.discountedPrice } : null,
  };
}

// GET /api/trusted-drivers/:riderId — list trusted drivers
router.get('/:riderId', (req, res) => {
  const list = store.trustedDrivers
    .filter((t) => t.riderId === req.params.riderId && t.status !== 'removed')
    .map(hydrate);
  res.json({ trustedDrivers: list, count: list.length, max: MAX_TRUSTED_DRIVERS });
});

// POST /api/trusted-drivers/invite — rider sends invite to a driver
router.post('/invite', (req, res) => {
  const { riderId, driverId } = req.body;
  const rider = riderById(riderId);
  const driver = driverById(driverId);
  if (!rider || !driver) return res.status(404).json({ error: 'Rider or driver not found' });

  // Already trusted / pending?
  const existing = store.trustedDrivers.find(
    (t) => t.riderId === riderId && t.driverId === driverId && t.status !== 'removed'
  );
  if (existing) return res.status(409).json({ error: 'Driver already in your trusted list', trustedDriver: hydrate(existing) });

  // Eligibility gate.
  const elig = evaluate(riderId, driverId);
  if (!elig.eligible) return res.status(422).json({ error: 'Driver is not eligible', eligibility: elig });

  // Max 3 cap (Edge case: adding a 4th).
  if (atLimit(riderId)) {
    return res.status(409).json({
      error: 'TRUSTED_DRIVER_LIMIT',
      message: `You can have up to ${MAX_TRUSTED_DRIVERS} trusted drivers. Remove one to add ${driver.name.split(' ')[0]}.`,
      count: activeCount(riderId),
      max: MAX_TRUSTED_DRIVERS,
    });
  }

  const isFirst = activeCount(riderId) === 0;
  const t = {
    id: nextId('td'),
    riderId,
    driverId,
    status: 'pending',
    isPrimary: isFirst, // first trusted driver becomes the preferred/primary
    createdAt: new Date().toISOString(),
    acceptedAt: null,
  };
  store.trustedDrivers.push(t);

  notify({
    event: 'invite_sent', recipient: 'driver', recipientId: driverId,
    channels: ['push', 'in-app'],
    message: `${rider.name} would like to add you as a Trusted Driver.`,
  });

  res.status(201).json({ trustedDriver: hydrate(t) });
});

// PATCH /api/trusted-drivers/:id/respond — driver accepts / declines
router.patch('/:id/respond', (req, res) => {
  const { action, availabilitySet } = req.body; // 'accept' | 'decline'
  const t = store.trustedDrivers.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Invite not found' });
  if (t.status !== 'pending') return res.status(409).json({ error: `Invite already ${t.status}` });

  const rider = riderById(t.riderId);
  const driver = driverById(t.driverId);

  if (action === 'accept') {
    t.status = 'active';
    t.acceptedAt = new Date().toISOString();
    if (typeof availabilitySet === 'boolean') driver.availabilitySet = availabilitySet;
    notify({
      event: 'invite_accepted', recipient: 'rider', recipientId: t.riderId,
      channels: ['push', 'in-app'],
      message: `${driver.name.split(' ')[0]} accepted your Trusted Driver request. 🎉`,
    });
  } else if (action === 'decline') {
    t.status = 'removed';
    notify({
      event: 'invite_declined', recipient: 'rider', recipientId: t.riderId,
      channels: ['push', 'in-app'],
      message: `${driver.name.split(' ')[0]} declined your Trusted Driver request.`,
    });
  } else {
    return res.status(400).json({ error: 'action must be "accept" or "decline"' });
  }
  res.json({ trustedDriver: hydrate(t) });
});

// DELETE /api/trusted-drivers/:id — rider removes a trusted driver
router.delete('/:id', (req, res) => {
  const t = store.trustedDrivers.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  t.status = 'removed';

  // Cancel any active pass tied specifically to this driver.
  store.subscriptions
    .filter((s) => s.riderId === t.riderId && s.driverId === t.driverId && s.status === 'active')
    .forEach((s) => { s.status = 'cancelled'; });

  // If we removed the primary, promote the next active trusted driver.
  if (t.isPrimary) {
    t.isPrimary = false;
    const next = store.trustedDrivers.find((x) => x.riderId === t.riderId && x.status === 'active');
    if (next) next.isPrimary = true;
  }
  res.json({ ok: true });
});

module.exports = router;
