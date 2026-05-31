/**
 * Razorpay payment stub.
 *
 * In production this creates a Razorpay Order, the client opens Checkout, and a
 * webhook confirms capture. Here we simulate that round-trip synchronously so the
 * prototype runs without keys. Swap `createOrder` / `verify` for the real SDK calls.
 */
const { nextId } = require('../db/store');

function createOrder({ amount, currency = 'INR', notes = {} }) {
  return {
    id: nextId('order'),
    amount: Math.round(amount * 100), // paise
    currency,
    status: 'created',
    notes,
  };
}

// Simulated capture. The prototype lets the UI force a failure to exercise the
// retry / grace-period edge cases.
function capture({ orderId, simulateFailure = false }) {
  if (simulateFailure) {
    return { ok: false, orderId, error: { code: 'PAYMENT_FAILED', description: 'Payment declined by bank' } };
  }
  return { ok: true, orderId, paymentId: nextId('pay'), status: 'captured' };
}

module.exports = { createOrder, capture };
