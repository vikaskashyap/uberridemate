# RideMate — Trusted Driver Pass

**🔗 Live demo: https://uberridemate.vercel.app** (open on a phone and *Add to Home Screen* for the full app feel)


Full-stack implementation of the **Trusted Driver Pass** feature (per `requirements.md` and `PRD-uber-ride-pass.docx`). Lets frequent commuters subscribe to preferred bike drivers for recurring rides — eligibility-gated trusted list, driver invitation flow, monthly subscription, and a priority matching engine. Pilot: **Delhi NCR**.

Built in **Uber's current design theme** (monochrome black/white, Uber green accent, Uber Move-style type, pill buttons, bottom sheets, map canvas).

## Run

```bash
cd backend
npm install
npm start
```

On startup the server prints two URLs:

```
▸ This computer:  http://localhost:4000
▸ On your phone:  http://192.168.x.x:4000   (same Wi-Fi → open & "Add to Home Screen")
```

> Runs with zero external setup: the data layer is seeded in-memory (`backend/db/store.js`) and Razorpay/FCM are stubbed. The matching Postgres schema is in `backend/db/schema.sql` — swap the store for `pg` to go live.

## Deploy (Vercel)

Already deployed at **https://uberridemate.vercel.app**. To redeploy after changes:

```bash
npx vercel --prod --scope <your-team>
```

How it maps to Vercel (see `vercel.json`):
- `/api/*` → a single serverless function (`api/index.js`) wrapping the Express app
- everything else → static files served from `frontend/` via the CDN

> **Serverless state caveat:** the demo uses an in-memory store, and serverless
> instances are ephemeral. State (trusted drivers you add, passes you buy, rides
> you take) is consistent while the function instance stays **warm** — fine for a
> single walk-through — but **resets to the seed on a cold start**. For durable
> state, swap `backend/db/store.js` for a database using `backend/db/schema.sql`
> (e.g. Vercel Postgres / Neon).

## Use it on your phone (installable PWA)

This is a **mobile app**, not just a desktop mockup:

1. Put your phone on the **same Wi-Fi** as this computer.
2. Open the **`On your phone`** URL printed above in the phone's browser.
3. Tap **Share → Add to Home Screen** (iOS Safari) or **⋮ → Install app** (Android Chrome).

It then launches full-screen with its own icon, no browser chrome, and respects the
device notch / home-indicator safe areas — indistinguishable from a native app.
On a desktop browser the same URL shows the app inside a phone frame for demos.

> For a production build, the same screens map 1:1 to React Native (the PRD's stated stack); the API and engines here are the backend it would call.

## Try the flows

The home tab is a **full Uber-style ride flow** with RideMate woven in:

| Flow | How |
|---|---|
| **Book a ride (full lifecycle)** | Home → **Where to?** → pick a destination → **Choose a ride** (Moto / Moto Saver / Auto with fares & ETA) → *Finding your ride* → driver assigned with **PIN, plate, call/message** → trip auto-advances (on the way → arrived → on trip) → **arrived → rate driver** |
| **C · Priority matching** | Each booking shows the matched **tier banner**: Preferred → Trusted Pool → Marketplace. With an active pass on your preferred driver you get *“Matched with your trusted driver Kabir”*; with no pass it’s marketplace |
| **A · Add a trusted driver** | After a completed trip with an eligible driver (e.g. **Rajesh** — 8 rides, 4.9★), the post-ride prompt appears automatically → *Add as Trusted Driver* → *Open driver invite screen* → **Accept** |
| **Eligibility block** | Finish a trip matched to **Amit** (4.7★) or **Imran** (<5 rides) → no prompt (rule fails server-side) |
| **Pass covers the fare** | Buy a pass, then book a **Moto** → fare shows **₹0 · Included in your Pass**, and the completion screen reads *“Covered by your Pass · ride N”* |
| **Edge · driver goes offline mid-trip** | During any trip, tap **⚠︎ Driver offline** → *“…finding another ride”* → the matching engine **re-runs and reassigns** with a fresh PIN/ETA. A dropped preferred driver falls through to **trusted pool → marketplace**; if none are left you get a **no drivers** screen |
| **4-driver cap** | Fill 3 slots, then try a 4th → limit sheet with “remove one” |
| **B · Buy a monthly pass** | Trusted tab → tap a driver → *Buy Monthly Pass* → adjust rides → *Subscribe* (tick “simulate failure” for the retry path) → set commute schedule |
| **Trips history** | Trips tab → past rides with date, product, fare, your rating, and a trusted-tier badge; tap any trip for details + **Rebook**. Header shows completed-trip count and total spend |
| **Pass dashboard** | Pass tab → rides used vs estimate, savings, next billing, end-of-cycle cancel |
| **Notifications** | Activity tab → every push/email/in-app event the flows emit |

> Deep-link a tab with a hash, e.g. `http://localhost:4000#trips` or `#pass`.

### Ride lifecycle API

```
GET  /api/rides                     trip history (completed + cancelled) + spend stats
GET  /api/rides/products            fare quote per product (Moto/Auto), pass-covered flag
POST /api/rides/request             book — runs priority matching, returns driver + PIN + tier
POST /api/rides/:id/advance         driver_assigned → arrived → on_trip → completed (+ eligibility prompt)
POST /api/rides/:id/driver-offline  assigned driver drops mid-trip → re-match (pool → marketplace)
POST /api/rides/:id/rate            rate the driver        POST /api/rides/:id/cancel
GET  /api/places                    saved + recent destinations
```

## Architecture

```
backend/
  server.js              Express app; serves API + frontend
  db/store.js            Seeded in-memory store (mirrors schema.sql)
  db/schema.sql          PostgreSQL DDL (TrustedDriver, Subscription, CommuteSchedule)
  services/
    eligibility.js       ≥5 rides, ≥4.8★, 0 incidents, opted-in; max-3 cap
    matching.js          Priority engine: preferred → trusted pool → marketplace
    payments.js          Razorpay stub (createOrder / capture)
    notifications.js     FCM + email stub (records an activity feed)
  routes/
    trustedDrivers.js    GET / POST invite / PATCH respond / DELETE
    subscriptions.js     GET / POST / PATCH cancel / GET estimate
    schedules.js         POST / GET / PATCH
    matching.js          POST priority-match
    app.js               /me, /drivers, /rides/complete, /notifications
frontend/
  index.html  styles.css  app.js   Uber-themed mobile prototype (vanilla JS)
```

### API endpoints

```
GET    /api/trusted-drivers/:riderId         POST /api/trusted-drivers/invite
PATCH  /api/trusted-drivers/:id/respond       DELETE /api/trusted-drivers/:id
GET    /api/subscriptions/:riderId            POST /api/subscriptions
PATCH  /api/subscriptions/:id/cancel          GET  /api/subscriptions/:riderId/estimate
POST   /api/schedules   GET /api/schedules/:subscriptionId   PATCH /api/schedules/:id
POST   /api/matching/priority-match
GET    /api/me  /api/drivers  /api/notifications   POST /api/rides/complete
```

## Scope

Implements MVP (FR1–FR5), all six UI screens, the documented edge cases (preferred unavailable → fallback, 4th-driver block, payment failure + grace period, end-of-cycle cancel). **Out of scope** (per PRD): AI Compatibility Score, predictive scheduling, dynamic pricing, corporate plans, multi-city.
