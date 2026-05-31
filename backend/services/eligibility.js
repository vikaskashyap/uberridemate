/**
 * Eligibility rules (evaluated server-side after each ride completion).
 * ALL conditions must pass before a rider can add a driver as Trusted.
 */
const { store } = require('../db/store');

const RULES = {
  minRidesTogether: 5,
  minRating: 4.8,
  maxActiveIncidents: 0,
};
const MAX_TRUSTED_DRIVERS = 3;

function evaluate(riderId, driverId) {
  const driver = store.drivers.find((d) => d.id === driverId);
  if (!driver) return { eligible: false, checks: [], reason: 'Driver not found' };

  const checks = [
    {
      key: 'rides_together',
      label: `≥ ${RULES.minRidesTogether} rides completed together`,
      value: driver.ridesWithRider,
      pass: driver.ridesWithRider >= RULES.minRidesTogether,
    },
    {
      key: 'rating',
      label: `Driver rating ≥ ${RULES.minRating}`,
      value: driver.rating,
      pass: driver.rating >= RULES.minRating,
    },
    {
      key: 'safety',
      label: 'No active safety incidents',
      value: driver.activeIncidents,
      pass: driver.activeIncidents <= RULES.maxActiveIncidents,
    },
    {
      key: 'opted_in',
      label: 'Driver opted into Trusted Driver program',
      value: driver.optedIn,
      pass: driver.optedIn === true,
    },
  ];

  return { eligible: checks.every((c) => c.pass), checks, ridesWithRider: driver.ridesWithRider };
}

/** Count trusted drivers that occupy a slot (pending or active). */
function activeCount(riderId) {
  return store.trustedDrivers.filter(
    (t) => t.riderId === riderId && t.status !== 'removed'
  ).length;
}

function atLimit(riderId) {
  return activeCount(riderId) >= MAX_TRUSTED_DRIVERS;
}

module.exports = { evaluate, atLimit, activeCount, MAX_TRUSTED_DRIVERS, RULES };
