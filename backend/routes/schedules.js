const express = require('express');
const { store, nextId } = require('../db/store');

const router = express.Router();

// POST /api/schedules — save a commute schedule (informational in MVP)
router.post('/', (req, res) => {
  const { subscriptionId, daysOfWeek, pickupTime, pickupLocation, dropLocation } = req.body;
  const sub = store.subscriptions.find((s) => s.id === subscriptionId);
  if (!sub) return res.status(404).json({ error: 'Subscription not found' });

  const schedule = {
    id: nextId('sch'),
    subscriptionId,
    daysOfWeek: daysOfWeek || ['mon', 'tue', 'wed', 'thu', 'fri'],
    pickupTime: pickupTime || '09:00',
    pickupLocation: pickupLocation || sub.routeOrigin,
    dropLocation: dropLocation || sub.routeDestination,
  };
  store.schedules.push(schedule);
  res.status(201).json({ schedule });
});

// GET /api/schedules/:subscriptionId
router.get('/:subscriptionId', (req, res) => {
  const schedule = store.schedules.find((s) => s.subscriptionId === req.params.subscriptionId);
  res.json({ schedule: schedule || null });
});

// PATCH /api/schedules/:id
router.patch('/:id', (req, res) => {
  const schedule = store.schedules.find((s) => s.id === req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Not found' });
  Object.assign(schedule, req.body, { id: schedule.id, subscriptionId: schedule.subscriptionId });
  res.json({ schedule });
});

module.exports = router;
