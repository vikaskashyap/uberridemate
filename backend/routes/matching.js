const express = require('express');
const { priorityMatch } = require('../services/matching');
const { store } = require('../db/store');
const { notify } = require('../services/notifications');

const router = express.Router();

// POST /api/matching/priority-match — trigger priority match for a booking
router.post('/priority-match', (req, res) => {
  const { riderId, origin, destination } = req.body;
  const match = priorityMatch(riderId);

  // Increment rides_used when a subscriber's ride is matched via a trusted tier.
  if (match.tier !== 'marketplace') {
    const sub = store.subscriptions.find((s) => s.riderId === riderId && s.status === 'active');
    if (sub) sub.ridesUsed += 1;
  }

  if (match.driver) {
    notify({
      event: 'ride_matched', recipient: 'rider', recipientId: riderId,
      channels: ['in-app'],
      message: match.message,
    });
  }

  res.json({ booking: { origin, destination }, match });
});

module.exports = router;
