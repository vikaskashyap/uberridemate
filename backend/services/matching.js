/**
 * Priority Matching Engine (FR4).
 *
 * Tier order when a subscriber books:
 *   1. Preferred Driver   — the rider's primary trusted driver, if online
 *   2. Trusted Pool       — any of their ≤3 trusted drivers that is online
 *   3. Standard Marketplace — normal matching (nearest / best available)
 *
 * Edge cases handled:
 *   - Preferred unavailable  → fall through to pool, then marketplace
 *   - Driver accepted but no availability slots → eligible but treated as lower priority
 */
const { store } = require('../db/store');

function priorityMatch(riderId) {
  const sub = store.subscriptions.find((s) => s.riderId === riderId && s.status === 'active');

  // No active pass → standard marketplace matching only.
  if (!sub) {
    return matchMarketplace(riderId, { reason: 'No active Trusted Driver Pass' });
  }

  const trusted = store.trustedDrivers
    .filter((t) => t.riderId === riderId && t.status === 'active')
    .map((t) => ({ ...t, driver: store.drivers.find((d) => d.id === t.driverId) }))
    .filter((t) => t.driver);

  // Tier 1 — Preferred driver (primary, online). Drivers with availability set rank first.
  const preferred = trusted
    .filter((t) => t.isPrimary && t.driver.online)
    .sort((a, b) => Number(b.driver.availabilitySet) - Number(a.driver.availabilitySet))[0];
  if (preferred) {
    return result('preferred', preferred.driver, `Matched with your trusted driver ${first(preferred.driver.name)}`);
  }

  // Tier 2 — Trusted pool (any online trusted driver). Availability-set drivers prioritised.
  const pool = trusted
    .filter((t) => t.driver.online)
    .sort((a, b) => Number(b.driver.availabilitySet) - Number(a.driver.availabilitySet))[0];
  if (pool) {
    return result('trusted_pool', pool.driver, `Matched from your trusted pool — ${first(pool.driver.name)}`);
  }

  // Tier 3 — Marketplace fallback.
  return matchMarketplace(riderId, { reason: 'No trusted driver online right now' });
}

function matchMarketplace(riderId, meta = {}) {
  const trustedIds = new Set(
    store.trustedDrivers.filter((t) => t.riderId === riderId).map((t) => t.driverId)
  );
  const candidate = store.drivers
    .filter((d) => d.online && !trustedIds.has(d.id))
    .sort((a, b) => b.rating - a.rating)[0];
  return result('marketplace', candidate || null, 'Matched with a marketplace driver', meta);
}

function result(tier, driver, message, meta = {}) {
  return {
    tier,                                   // preferred | trusted_pool | marketplace
    message,
    driver: driver
      ? { id: driver.id, name: driver.name, photo: driver.photo, rating: driver.rating, vehicle: driver.vehicle }
      : null,
    ...meta,
  };
}

const first = (name) => name.split(' ')[0];

module.exports = { priorityMatch };
