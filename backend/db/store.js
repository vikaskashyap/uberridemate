/**
 * In-memory data store, seeded with Delhi NCR pilot data.
 *
 * This mirrors the Postgres schema in db/schema.sql. It is intentionally a thin
 * key-value layer so the route handlers read like they would against a real DB.
 * To move to Postgres, replace these arrays with `pg` queries against schema.sql —
 * the shapes are identical.
 */

let _seq = 1000;
const nextId = (prefix) => `${prefix}_${++_seq}`;

const store = {
  // The signed-in rider for this prototype.
  currentRiderId: 'rider_1',

  users: [
    { id: 'rider_1', name: 'Vikas', photo: '🧑🏽', phone: '+91 98xxx xx210', home: 'Saket', office: 'Cyber City, Gurugram' },
  ],

  drivers: [
    // id, name, rating, opted_in, online, vehicle, rides_with_rider_1, active_incidents
    { id: 'driver_1', name: 'Rajesh Kumar',  photo: '🧔🏽', rating: 4.9,  optedIn: true,  online: true,  vehicle: 'Honda Activa · DL 3S AB 1234', ridesWithRider: 8, activeIncidents: 0, availabilitySet: true },
    { id: 'driver_2', name: 'Sunil Yadav',   photo: '👨🏽', rating: 4.85, optedIn: true,  online: false, vehicle: 'TVS Jupiter · DL 8C XY 7788',  ridesWithRider: 6, activeIncidents: 0, availabilitySet: false },
    { id: 'driver_3', name: 'Amit Sharma',   photo: '🧑🏻', rating: 4.7,  optedIn: true,  online: true,  vehicle: 'Bajaj Pulsar · DL 1P QR 4521', ridesWithRider: 9, activeIncidents: 0, availabilitySet: false },
    { id: 'driver_4', name: 'Imran Khan',    photo: '👳🏽', rating: 4.92, optedIn: true,  online: true,  vehicle: 'Hero Splendor · DL 5T MN 9090', ridesWithRider: 3, activeIncidents: 0, availabilitySet: false },
    { id: 'driver_5', name: 'Kabir Singh',   photo: '🧑🏽‍🦱', rating: 4.95, optedIn: true,  online: true,  vehicle: 'Honda Dio · DL 2C JK 3311',    ridesWithRider: 12, activeIncidents: 0, availabilitySet: true },
    { id: 'driver_6', name: 'Deepak Verma',  photo: '🧑🏾', rating: 4.88, optedIn: false, online: true,  vehicle: 'Suzuki Access · DL 7B GH 2200', ridesWithRider: 7, activeIncidents: 0, availabilitySet: false },
  ],

  // TrustedDriver: rider_id, driver_id, status: pending|active|removed
  trustedDrivers: [
    { id: 'td_1', riderId: 'rider_1', driverId: 'driver_5', status: 'active', createdAt: '2026-05-01T08:00:00Z', acceptedAt: '2026-05-01T09:12:00Z', isPrimary: true },
  ],

  // Subscription (Monthly Pass)
  subscriptions: [],

  // CommuteSchedule
  schedules: [],

  // Live + historical rides (full ride lifecycle)
  rides: [],

  // Saved + recent places for the destination picker
  places: [
    { id: 'pl_home',  name: 'Home',          area: 'Saket, New Delhi',            icon: '🏠', kind: 'saved' },
    { id: 'pl_work',  name: 'Work',          area: 'Cyber City, Gurugram',        icon: '💼', kind: 'saved' },
    { id: 'pl_apt',   name: 'IGI Airport T3', area: 'Indira Gandhi Intl Airport', icon: '✈️', kind: 'recent' },
    { id: 'pl_cp',    name: 'Connaught Place', area: 'Rajiv Chowk, New Delhi',     icon: '🛍️', kind: 'recent' },
    { id: 'pl_hkv',   name: 'Hauz Khas Village', area: 'Hauz Khas, New Delhi',    icon: '🍽️', kind: 'recent' },
    { id: 'pl_hub',   name: 'DLF CyberHub',  area: 'DLF Phase 2, Gurugram',       icon: '🍻', kind: 'recent' },
  ],

  // Notifications emitted (so the UI can show an activity feed)
  notifications: [],
};

// Seed a few historical trips so the Trips screen is populated on first load.
const d = (id) => store.drivers.find((x) => x.id === id);
const ICON = { moto: '🛵', moto_saver: '🛵', auto: '🛺' };
const histRide = (o) => ({
  id: o.id, riderId: 'rider_1', origin: o.origin, destination: o.destination,
  productId: o.productId, product: { id: o.productId, name: o.name, icon: ICON[o.productId] },
  driver: d(o.driverId), tier: o.tier || 'marketplace',
  tierMessage: o.tierMessage || 'Matched with a marketplace driver',
  baseFare: o.fare, fare: o.passApplied ? 0 : o.fare,
  passApplied: !!o.passApplied, passRideNo: o.passRideNo || null,
  etaMin: null, otp: null, status: o.status, rating: o.rating || null, createdAt: o.createdAt,
});
store.rides.push(
  histRide({ id: 'ride_h1', origin: 'Saket', destination: 'Work', productId: 'moto', name: 'RideMate Moto', driverId: 'driver_1', fare: 150, rating: 5, status: 'completed', createdAt: '2026-05-29T09:05:00Z' }),
  histRide({ id: 'ride_h2', origin: 'Saket', destination: 'Connaught Place', productId: 'moto', name: 'RideMate Moto', driverId: 'driver_3', fare: 150, rating: 4, status: 'completed', createdAt: '2026-05-28T19:42:00Z' }),
  histRide({ id: 'ride_h3', origin: 'Saket', destination: 'Work', productId: 'auto', name: 'Auto', driverId: 'driver_2', fare: 255, rating: 5, status: 'completed', createdAt: '2026-05-27T09:12:00Z' }),
  histRide({ id: 'ride_h4', origin: 'Saket', destination: 'IGI Airport T3', productId: 'moto', name: 'RideMate Moto', driverId: 'driver_5', fare: 150, status: 'cancelled', createdAt: '2026-05-25T05:30:00Z' }),
);

module.exports = { store, nextId };
