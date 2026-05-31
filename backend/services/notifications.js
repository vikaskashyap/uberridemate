/**
 * Notification service (FCM + email stub).
 *
 * Records every notification in the store so the prototype can surface an
 * in-app activity feed. In production, `push` calls FCM and `email` calls the
 * transactional email provider.
 */
const { store, nextId } = require('../db/store');

function notify({ event, recipient, recipientId, channels, message }) {
  const n = {
    id: nextId('ntf'),
    event,
    recipient,            // 'rider' | 'driver'
    recipientId,
    channels,             // e.g. ['push','in-app'] or ['push','email']
    message,
    createdAt: new Date().toISOString(),
    read: false,
  };
  store.notifications.unshift(n);
  // eslint-disable-next-line no-console
  console.log(`[notify:${channels.join('+')}] → ${recipient} ${recipientId}: ${message}`);
  return n;
}

module.exports = { notify };
