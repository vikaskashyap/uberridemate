const express = require('express');
const { store, nextId } = require('../db/store');
const { priorityMatch } = require('../services/matching');
const { evaluate, atLimit } = require('../services/eligibility');
const { notify } = require('../services/notifications');

const router = express.Router();

// Bike-first ride products (RideMate is a bike ride-hailing app).
const PRODUCTS = [
  { id: 'moto',       name: 'RideMate Moto', desc: 'Affordable bike rides',        icon: '🛵', mult: 1.0,  etaMin: 3 },
  { id: 'moto_saver', name: 'Moto Saver',    desc: 'A little wait, a lower price', icon: '🛵', mult: 0.82, etaMin: 7 },
  { id: 'auto',       name: 'Auto',          desc: 'Doorstep auto rides',          icon: '🛺', mult: 1.7,  etaMin: 5 },
];
const BASE_FARE = 150; // ₹ base for a Moto on a typical Delhi NCR commute leg

const driverById = (id) => store.drivers.find((d) => d.id === id);
const otp = () => String(Math.floor(1000 + Math.random() * 9000));

function publicRide(r) {
  return {
    id: r.id, status: r.status, origin: r.origin, destination: r.destination,
    productId: r.productId, product: r.product, tier: r.tier, tierMessage: r.tierMessage,
    fare: r.fare, baseFare: r.baseFare, passApplied: r.passApplied, passRideNo: r.passRideNo,
    etaMin: r.etaMin, otp: r.otp, rating: r.rating, createdAt: r.createdAt,
    driver: r.driver ? {
      id: r.driver.id, name: r.driver.name, photo: r.driver.photo,
      rating: r.driver.rating, vehicle: r.driver.vehicle,
    } : null,
  };
}

// GET /api/rides — trip history (completed + cancelled), newest first
router.get('/', (req, res) => {
  const rides = store.rides
    .filter((r) => r.riderId === store.currentRiderId && ['completed', 'cancelled'].includes(r.status))
    .map(publicRide);
  const completed = rides.filter((r) => r.status === 'completed');
  const totalSpend = completed.reduce((sum, r) => sum + (r.passApplied ? 0 : r.fare), 0);
  res.json({ rides, stats: { trips: completed.length, totalSpend } });
});

// GET /api/rides/products?destination=  — fare quote per product
router.get('/products', (req, res) => {
  const sub = store.subscriptions.find((s) => s.riderId === store.currentRiderId && s.status === 'active');
  const products = PRODUCTS.map((p) => {
    const fare = Math.round(BASE_FARE * p.mult);
    // The pass covers Moto rides on the active route.
    const covered = !!sub && p.id === 'moto';
    return { ...p, fare, covered, displayFare: covered ? 0 : fare };
  });
  res.json({ products, hasPass: !!sub });
});

// POST /api/rides/request  { origin, destination, productId } — book a ride
router.post('/request', (req, res) => {
  const riderId = store.currentRiderId;
  const { origin, destination, productId } = req.body;
  const product = PRODUCTS.find((p) => p.id === productId) || PRODUCTS[0];

  // Priority Matching Engine (preferred → trusted pool → marketplace).
  const match = priorityMatch(riderId);
  const driver = match.driver ? driverById(match.driver.id) : null;

  const sub = store.subscriptions.find((s) => s.riderId === riderId && s.status === 'active');
  const passApplied = !!sub && product.id === 'moto';
  const baseFare = Math.round(BASE_FARE * product.mult);

  const ride = {
    id: nextId('ride'),
    riderId,
    origin: origin || store.users[0].home,
    destination: destination || store.users[0].office,
    productId: product.id,
    product: { id: product.id, name: product.name, icon: product.icon },
    driver,
    tier: match.tier,
    tierMessage: match.message,
    baseFare,
    fare: passApplied ? 0 : baseFare,
    passApplied,
    passRideNo: passApplied ? sub.ridesUsed + 1 : null,
    etaMin: driver ? product.etaMin : null,
    otp: otp(),
    status: driver ? 'driver_assigned' : 'no_drivers',
    rating: null,
    createdAt: new Date().toISOString(),
  };
  store.rides.unshift(ride);

  if (driver) {
    notify({
      event: 'ride_matched', recipient: 'rider', recipientId: riderId,
      channels: ['in-app'], message: match.message,
    });
  }
  res.status(201).json({ ride: publicRide(ride) });
});

// GET /api/rides/:id
router.get('/:id', (req, res) => {
  const ride = store.rides.find((r) => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  res.json({ ride: publicRide(ride) });
});

// POST /api/rides/:id/advance — move the trip to its next state
// driver_assigned → arrived → on_trip → completed
router.post('/:id/advance', (req, res) => {
  const ride = store.rides.find((r) => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });

  const flow = { driver_assigned: 'arrived', arrived: 'on_trip', on_trip: 'completed' };
  const next = flow[ride.status];
  if (!next) return res.status(409).json({ error: `Cannot advance from ${ride.status}` });
  ride.status = next;

  let prompt = null;
  if (next === 'completed' && ride.driver) {
    // Ride history grows → eligibility is re-evaluated server-side (FR2 trigger).
    ride.driver.ridesWithRider += 1;
    if (ride.passApplied) {
      const sub = store.subscriptions.find((s) => s.riderId === ride.riderId && s.status === 'active');
      if (sub) sub.ridesUsed += 1;
    }
    const eligibility = evaluate(ride.riderId, ride.driver.id);
    const alreadyTrusted = store.trustedDrivers.some(
      (t) => t.riderId === ride.riderId && t.driverId === ride.driver.id && t.status !== 'removed'
    );
    const showPrompt = eligibility.eligible && !alreadyTrusted && !atLimit(ride.riderId);
    prompt = {
      showPrompt,
      eligibility,
      driver: {
        id: ride.driver.id, name: ride.driver.name, photo: ride.driver.photo,
        rating: ride.driver.rating, ridesWithRider: ride.driver.ridesWithRider,
      },
      promptText: showPrompt
        ? `You've completed ${ride.driver.ridesWithRider} rides with ${ride.driver.name.split(' ')[0]}. Would you like to add them as a Trusted Driver?`
        : null,
    };
  }
  res.json({ ride: publicRide(ride), prompt });
});

// POST /api/rides/:id/driver-offline — assigned driver drops mid-trip → re-match
// Edge case: preferred/trusted driver unavailable → fall through pool → marketplace.
router.post('/:id/driver-offline', (req, res) => {
  const ride = store.rides.find((r) => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  if (!['driver_assigned', 'arrived', 'on_trip'].includes(ride.status)) {
    return res.status(409).json({ error: `No active driver to drop in status ${ride.status}` });
  }

  const dropped = ride.driver;
  if (dropped) {
    dropped.online = false; // they've gone offline / left the trip
    notify({
      event: 'driver_offline', recipient: 'rider', recipientId: ride.riderId,
      channels: ['push', 'in-app'],
      message: `${dropped.name.split(' ')[0]} went offline. Finding you another ride on the same route…`,
    });
  }

  // Re-run the Priority Matching Engine. The dropped driver is now offline, so the
  // engine naturally falls through (preferred → trusted pool → marketplace).
  const match = priorityMatch(ride.riderId);
  const driver = match.driver ? driverById(match.driver.id) : null;

  if (!driver) {
    ride.status = 'no_drivers';
    ride.driver = null;
    return res.json({
      ride: publicRide(ride), reassigned: false,
      droppedDriver: dropped ? { name: dropped.name } : null,
      message: 'No other drivers are available right now.',
    });
  }

  const product = PRODUCTS.find((p) => p.id === ride.productId) || PRODUCTS[0];
  ride.driver = driver;
  ride.tier = match.tier;
  ride.tierMessage = match.message;
  ride.otp = otp();              // fresh start PIN for the new driver
  ride.etaMin = product.etaMin;
  ride.status = 'driver_assigned'; // new driver is now en route to pickup

  notify({
    event: 'ride_matched', recipient: 'rider', recipientId: ride.riderId,
    channels: ['in-app'], message: `Reassigned — ${match.message}`,
  });

  res.json({
    ride: publicRide(ride), reassigned: true,
    droppedDriver: dropped ? { name: dropped.name } : null,
  });
});

// POST /api/rides/:id/rate  { rating }
router.post('/:id/rate', (req, res) => {
  const ride = store.rides.find((r) => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  ride.rating = Math.max(1, Math.min(5, Number(req.body.rating) || 5));
  res.json({ ride: publicRide(ride) });
});

// POST /api/rides/:id/cancel
router.post('/:id/cancel', (req, res) => {
  const ride = store.rides.find((r) => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  ride.status = 'cancelled';
  res.json({ ride: publicRide(ride) });
});

module.exports = router;
