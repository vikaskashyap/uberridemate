# RideMate — Trusted Driver Pass
## Requirements for Claude Code

---

## Overview

Build the **Trusted Driver Pass** feature for RideMate, a bike ride-hailing app. This feature allows frequent commuters to subscribe to preferred bike drivers for recurring rides, improving safety perception, ride consistency, and driver earnings predictability.

**Pilot target:** Delhi NCR  
**Platform:** Mobile-first (React Native or Flutter — see Tech Stack note below)  
**MVP scope only** — AI features, dynamic pricing, and corporate plans are out of scope.

---

## Tech Stack

> Confirm with the team before starting. Suggested defaults:

- **Frontend:** React Native (or Flutter)
- **Backend:** Node.js + Express (or existing app backend)
- **Database:** PostgreSQL
- **Auth:** Existing Uber-style auth (token-based)
- **Payments:** Razorpay (for ₹ subscriptions)
- **Notifications:** FCM (Firebase Cloud Messaging)

---

## Data Models

### TrustedDriver
```
rider_id          UUID (FK → users)
driver_id         UUID (FK → drivers)
status            ENUM: pending | active | removed
created_at        TIMESTAMP
accepted_at       TIMESTAMP (nullable)
```

### Subscription (Monthly Pass)
```
id                UUID
rider_id          UUID (FK → users)
driver_id         UUID (FK → drivers) — nullable (pool pass)
route_origin      String
route_destination String
rides_per_month   INT
base_price        DECIMAL  (e.g., 3000.00)
discounted_price  DECIMAL  (e.g., 2700.00)
discount_pct      INT      (e.g., 10)
status            ENUM: active | cancelled | expired
billing_cycle     DATE
created_at        TIMESTAMP
```

### CommutSchedule (optional, user-defined)
```
id                UUID
subscription_id   UUID (FK → Subscription)
days_of_week      ARRAY<ENUM: mon|tue|wed|thu|fri|sat|sun>
pickup_time       TIME     (e.g., 09:00)
pickup_location   GeoPoint
drop_location     GeoPoint
```

---

## Eligibility Rules

Before a rider can add a driver to their Trusted Drivers list, **all** conditions must pass:

| Rule | Value |
|---|---|
| Completed rides together | ≥ 5 |
| Driver rating | ≥ 4.8 |
| Active safety incidents on driver | 0 |
| Driver has opted into Trusted Driver program | true |

Eligibility is evaluated server-side after each ride completion.

---

## Functional Requirements

### FR1 — Trusted Driver List

- Rider can **add** a driver (only after eligibility check passes)
- Rider can **remove** a driver at any time
- Rider can **view** trusted driver profiles (photo, rating, rides together, availability status)
- **Maximum 3 trusted drivers** per rider in MVP
- Adding a 4th driver should surface an error with option to remove an existing one

### FR2 — Driver Invitation Flow

**Trigger:** Post-ride eligibility check passes  
**Prompt to rider:**
> "You've completed [N] rides with [Driver Name]. Would you like to add them as a Trusted Driver?"

Actions: **Add Driver** | **Not Now**

If rider taps "Add Driver":
1. A request is sent to the driver
2. Driver sees notification: *"[Rider Name] would like to add you as a Trusted Driver."*
3. Driver can: **Accept** | **Decline** | **Set Availability**
4. Rider is notified of driver's response

**Driver opt-in is required.** A driver can withdraw from the program at any time.

### FR3 — Monthly Subscription (Pass Purchase)

Subscription screen must display:
- Route: Origin → Destination
- Estimated rides/month
- Current monthly spend (calculated from ride history)
- Pass price with discount
- Savings amount and percentage

User actions:
- **Subscribe** (initiates payment via Razorpay)
- **Renew** (auto-renew or manual)
- **Cancel** (takes effect at end of billing cycle)

Subscription is tied to a route. If the rider's route changes, the pass is **recalculated dynamically.**

### FR4 — Priority Matching Engine

When a subscriber books a ride, matching follows this priority order:

```
1. Preferred Driver (primary trusted driver, if available + online)
2. Trusted Driver Pool (any of their ≤3 trusted drivers)
3. Standard Marketplace (normal matching logic)
```

The rider should see which tier matched (e.g., *"Matched with your trusted driver Rajesh"*).

### FR5 — Commute Scheduling (Optional, User-Defined)

Rider can optionally save a recurring commute schedule:
- Pickup & drop locations
- Days of week (e.g., Mon–Fri)
- Typical booking time (e.g., 9:00 AM)

This is **informational in MVP** — it does not auto-book rides. It helps the matching engine prioritize driver availability.

---

## User Flows

### Flow A — Adding a Trusted Driver

```
Ride Completed
    → Backend evaluates eligibility
        → [FAIL] No prompt shown
        → [PASS] Show in-app prompt
            → "Not Now" → Dismiss (re-prompt after next 3 rides)
            → "Add Driver" → Send invite to driver
                → Driver Accepts → Driver added to Trusted List → Notify rider
                → Driver Declines → Notify rider
```

### Flow B — Purchasing a Monthly Pass

```
Rider opens "Trusted Drivers" menu
    → Selects a trusted driver
        → Taps "Buy Monthly Pass"
            → Subscription screen shown (route, savings, price)
                → Confirm & Pay → Razorpay payment
                    → Success → Pass activated, show confirmation
                    → Failure → Show error, retry option
```

### Flow C — Booking a Ride (Pass Active)

```
Rider books ride
    → System checks: active subscription?
        → YES → Priority matching (Preferred → Trusted Pool → Marketplace)
        → NO  → Standard matching
    → Ride assigned
    → Rider notified of match tier used
```

---

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Preferred driver is unavailable | Fall through to trusted pool, then marketplace |
| Driver leaves the platform | Notify rider; suggest finding a new trusted driver |
| Rider changes route mid-subscription | Recalculate pass pricing dynamically |
| Driver accepts but has no availability slots | Rider can still book; driver treated as lower priority |
| Rider tries to add 4th driver | Block with message + prompt to remove one |
| Subscription payment fails on renewal | Notify rider; grace period of 2 days before downgrading to standard |
| Rider cancels mid-cycle | No refund in MVP; access continues until end of cycle |

---

## API Endpoints

### Trusted Drivers

```
GET    /api/trusted-drivers/:riderId          — List trusted drivers
POST   /api/trusted-drivers/invite            — Send invite to driver
PATCH  /api/trusted-drivers/:id/respond       — Driver accepts/declines
DELETE /api/trusted-drivers/:id               — Rider removes a trusted driver
```

### Subscriptions

```
GET    /api/subscriptions/:riderId            — Get active subscription
POST   /api/subscriptions                     — Create new subscription
PATCH  /api/subscriptions/:id/cancel          — Cancel subscription
GET    /api/subscriptions/:riderId/estimate   — Get price estimate for a route
```

### Commute Schedule

```
POST   /api/schedules                         — Save commute schedule
GET    /api/schedules/:subscriptionId         — Get schedule for a subscription
PATCH  /api/schedules/:id                     — Update schedule
```

### Matching (internal)

```
POST   /api/matching/priority-match           — Trigger priority match for a booking
```

---

## Notifications

| Event | Recipient | Channel |
|---|---|---|
| Rider adds driver | Driver | Push + in-app |
| Driver accepts invite | Rider | Push + in-app |
| Driver declines invite | Rider | Push + in-app |
| Pass successfully purchased | Rider | Push + email |
| Pass renewal reminder (3 days before) | Rider | Push + email |
| Pass renewal failed | Rider | Push + email |
| Trusted driver goes offline / leaves platform | Rider | Push + in-app |
| Ride matched with trusted driver | Rider | In-app (booking screen) |

---

## UI Screens

### 1. Trusted Drivers Menu (new nav item)
- List of trusted drivers (photo, name, rating, # rides together)
- Subscription badge per driver (Active / Inactive)
- CTA: "Add Trusted Driver" (disabled if at limit of 3)

### 2. Driver Profile Card (within Trusted Drivers)
- Driver photo, name, rating
- Rides together count
- Availability status
- Subscription details if active
- Actions: "Buy Pass" | "Remove Driver"

### 3. Post-Ride Prompt (bottom sheet)
- Driver photo + name
- "You've completed [N] rides with [Name]"
- CTA: "Add as Trusted Driver" | "Not Now"

### 4. Driver Invite Screen (driver-side)
- Rider photo + name
- CTA: "Accept" | "Decline"
- Option: "Set My Availability" (link to schedule screen)

### 5. Subscription / Pass Purchase Screen
- Route display (origin → destination)
- Ride estimate for month
- Price breakdown (base → discounted)
- Savings highlight
- CTA: "Subscribe — ₹[price]/month"

### 6. Active Pass Dashboard
- Pass status (Active / Expiring Soon / Expired)
- Rides used vs. estimated
- Next billing date
- Manage: Renew | Cancel

---

## Success Metrics (Instrument from Day 1)

| Metric | Type |
|---|---|
| % of rides completed via Trusted Driver Pass | North Star |
| Monthly pass adoption rate | Primary |
| Repeat rider-driver pairing rate | Primary |
| Rider retention (30/60/90 day) | Primary |
| Driver retention in program | Primary |
| Monthly subscription revenue | Primary |
| Ride cancellation rate | Secondary |
| Safety complaint rate | Secondary |
| Rider NPS | Secondary |

---

## Out of Scope (MVP)

- ❌ AI Compatibility Score (Ride Compatibility Score)
- ❌ Predictive / auto scheduling
- ❌ Dynamic pricing per ride
- ❌ Corporate commute plans
- ❌ Driver Recommendation Engine
- ❌ Multi-city rollout (Phase 1 = Delhi NCR only)

---

## Rollout

| Phase | Scope |
|---|---|
| Phase 1 (MVP) | Delhi NCR only; all features listed in this doc |
| Phase 2 | Top 10 cities; trusted driver pool feature |
| Phase 3 | AI compatibility score; commute prediction |

---

## Open Questions for the Team

1. What's the existing tech stack? (confirm before scaffold)
2. Is Razorpay already integrated for other features?
3. What's the driver-facing app — same app with role switch, or separate?
4. What constitutes an "active safety incident" — is there an existing flag in the DB?
5. How is "ride together" count tracked today — is there a `rider_id + driver_id` index on the rides table?
6. Grace period on failed renewal — is 2 days acceptable, or needs product sign-off?
7. Should pass cancellation be immediate or end-of-cycle? (Assumed end-of-cycle above)

---

*PRD Version: V1.0 | Requirements Author: Claude | Feature: Trusted Driver Pass*
