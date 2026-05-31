const express = require('express');
const { store, nextId } = require('../db/store');
const { createOrder, capture } = require('../services/payments');
const { notify } = require('../services/notifications');

const router = express.Router();

const DISCOUNT_PCT = 10;          // flat MVP discount
const PER_RIDE_FARE = 150;        // ₹ average Saket → Cyber City bike fare
const GRACE_DAYS = 2;             // failed-renewal grace period

const riderById = (id) => store.users.find((u) => u.id === id);
const driverById = (id) => store.drivers.find((d) => d.id === id);

// Price estimate for a route (FR3). Current spend derived from ride history (mocked
// from rides/month × per-ride fare). Pass price = current spend − discount.
function priceFor({ origin, destination, ridesPerMonth }) {
  const rides = Number(ridesPerMonth) || 20;
  const basePrice = rides * PER_RIDE_FARE;            // current monthly spend
  const discountedPrice = Math.round(basePrice * (1 - DISCOUNT_PCT / 100));
  return {
    routeOrigin: origin,
    routeDestination: destination,
    ridesPerMonth: rides,
    perRideFare: PER_RIDE_FARE,
    basePrice,
    discountedPrice,
    discountPct: DISCOUNT_PCT,
    savings: basePrice - discountedPrice,
  };
}

function hydrate(s) {
  const d = s.driverId ? driverById(s.driverId) : null;
  return { ...s, driver: d ? { id: d.id, name: d.name, photo: d.photo } : null };
}

// GET /api/subscriptions/:riderId/estimate?origin=&destination=&ridesPerMonth=
router.get('/:riderId/estimate', (req, res) => {
  const rider = riderById(req.params.riderId);
  const origin = req.query.origin || (rider && rider.home) || 'Home';
  const destination = req.query.destination || (rider && rider.office) || 'Office';
  res.json(priceFor({ origin, destination, ridesPerMonth: req.query.ridesPerMonth }));
});

// GET /api/subscriptions/:riderId — active subscription
router.get('/:riderId', (req, res) => {
  const sub = store.subscriptions.find((s) => s.riderId === req.params.riderId && s.status === 'active');
  res.json({ subscription: sub ? hydrate(sub) : null });
});

// POST /api/subscriptions — create (purchase) a subscription via Razorpay
router.post('/', (req, res) => {
  const { riderId, driverId, origin, destination, ridesPerMonth, simulateFailure } = req.body;
  const rider = riderById(riderId);
  if (!rider) return res.status(404).json({ error: 'Rider not found' });

  const pricing = priceFor({
    origin: origin || rider.home,
    destination: destination || rider.office,
    ridesPerMonth,
  });

  // Razorpay round-trip (stubbed).
  const order = createOrder({ amount: pricing.discountedPrice, notes: { riderId, driverId } });
  const payment = capture({ orderId: order.id, simulateFailure: !!simulateFailure });
  if (!payment.ok) {
    return res.status(402).json({ error: 'PAYMENT_FAILED', detail: payment.error, order });
  }

  // Cancel any existing active sub for this rider (one active pass in MVP).
  store.subscriptions
    .filter((s) => s.riderId === riderId && s.status === 'active')
    .forEach((s) => { s.status = 'cancelled'; });

  const nextBilling = new Date('2026-06-30T00:00:00Z').toISOString().slice(0, 10);
  const sub = {
    id: nextId('sub'),
    riderId,
    driverId: driverId || null,
    routeOrigin: pricing.routeOrigin,
    routeDestination: pricing.routeDestination,
    ridesPerMonth: pricing.ridesPerMonth,
    basePrice: pricing.basePrice,
    discountedPrice: pricing.discountedPrice,
    discountPct: pricing.discountPct,
    status: 'active',
    autoRenew: true,
    billingCycle: nextBilling,
    ridesUsed: 0,
    createdAt: new Date().toISOString(),
  };
  store.subscriptions.push(sub);

  notify({
    event: 'pass_purchased', recipient: 'rider', recipientId: riderId,
    channels: ['push', 'email'],
    message: `Your Trusted Driver Pass is active — ₹${pricing.discountedPrice}/month, you save ₹${pricing.savings}.`,
  });

  res.status(201).json({ subscription: hydrate(sub), payment });
});

// PATCH /api/subscriptions/:id/cancel — cancel (effective end of cycle, no refund in MVP)
router.patch('/:id/cancel', (req, res) => {
  const sub = store.subscriptions.find((s) => s.id === req.params.id);
  if (!sub) return res.status(404).json({ error: 'Not found' });
  sub.status = 'cancelled';
  sub.autoRenew = false;
  notify({
    event: 'pass_cancelled', recipient: 'rider', recipientId: sub.riderId,
    channels: ['push', 'email'],
    message: `Your pass is cancelled. Access continues until ${sub.billingCycle}; no refund for the current cycle.`,
  });
  res.json({ subscription: hydrate(sub), note: `Access continues until ${sub.billingCycle}`, graceDays: GRACE_DAYS });
});

module.exports = router;
