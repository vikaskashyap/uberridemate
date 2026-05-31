-- RideMate · Trusted Driver Pass — PostgreSQL schema (Phase 1 / MVP)
-- The in-memory store in db/store.js mirrors these tables 1:1.

CREATE TYPE trusted_driver_status AS ENUM ('pending', 'active', 'removed');
CREATE TYPE subscription_status   AS ENUM ('active', 'cancelled', 'expired');
CREATE TYPE weekday               AS ENUM ('mon','tue','wed','thu','fri','sat','sun');

CREATE TABLE trusted_drivers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id    UUID NOT NULL REFERENCES users(id),
  driver_id   UUID NOT NULL REFERENCES drivers(id),
  status      trusted_driver_status NOT NULL DEFAULT 'pending',
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (rider_id, driver_id)
);

-- Enforce the MVP cap of 3 active/pending trusted drivers per rider at the app layer
-- (eligibility.js). A partial unique index alone can't express "max 3".
CREATE INDEX idx_trusted_drivers_rider ON trusted_drivers (rider_id) WHERE status <> 'removed';

CREATE TABLE subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id          UUID NOT NULL REFERENCES users(id),
  driver_id         UUID REFERENCES drivers(id),          -- nullable: pool pass
  route_origin      TEXT NOT NULL,
  route_destination TEXT NOT NULL,
  rides_per_month   INT  NOT NULL,
  base_price        DECIMAL(10,2) NOT NULL,
  discounted_price  DECIMAL(10,2) NOT NULL,
  discount_pct      INT  NOT NULL,
  status            subscription_status NOT NULL DEFAULT 'active',
  auto_renew        BOOLEAN NOT NULL DEFAULT true,
  billing_cycle     DATE NOT NULL,                         -- next billing date
  rides_used        INT  NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_rider ON subscriptions (rider_id) WHERE status = 'active';

CREATE TABLE commute_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  days_of_week    weekday[] NOT NULL,
  pickup_time     TIME NOT NULL,
  pickup_location TEXT NOT NULL,                            -- GeoPoint in prod (PostGIS)
  drop_location   TEXT NOT NULL
);

-- Index used by the eligibility evaluator to count completed rides per pair.
-- CREATE INDEX idx_rides_pair ON rides (rider_id, driver_id) WHERE status = 'completed';
