/* RideMate · Trusted Driver Pass — Uber-style ride-hailing app (vanilla JS) */

const API = '/api';
const $ = (id) => document.getElementById(id);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const firstName = (n) => (n || '').split(' ')[0];
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');

const api = {
  async get(p) { const r = await fetch(API + p); return r.json(); },
  async send(method, p, body) {
    const r = await fetch(API + p, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  },
  post(p, b) { return this.send('POST', p, b); },
  patch(p, b) { return this.send('PATCH', p, b); },
  del(p) { return this.send('DELETE', p); },
};

const state = {
  tab: 'home',
  me: null,
  riderId: 'rider_1',
  // Home-tab ride flow controller.
  flow: { step: 'home', ride: null, dest: null, products: null, selProd: 'moto', prompt: null, timer: null, prevPos: null },
};

const stars = (r) => `<span class="rating"><span class="star">★</span>${r.toFixed(2)}</span>`;

/* ---------------- sheet + toast ---------------- */
function openSheet(node) {
  $('sheet-body').innerHTML = '';
  $('sheet-body').appendChild(typeof node === 'string' ? el(`<div>${node}</div>`) : node);
  $('sheet').classList.add('show'); $('sheet-scrim').classList.add('show');
}
function closeSheet() { $('sheet').classList.remove('show'); $('sheet-scrim').classList.remove('show'); }
$('sheet-scrim').addEventListener('click', closeSheet);

let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---------------- bootstrap / routing ---------------- */
async function refreshMe() { state.me = await api.get('/me'); }

document.querySelectorAll('#nav button').forEach((b) =>
  b.addEventListener('click', () => navigate(b.dataset.tab)));

async function navigate(tab) {
  state.tab = tab;
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  await render();
}

async function render() {
  await refreshMe();
  const v = $('view'); v.innerHTML = '';
  if (state.tab === 'home') v.appendChild(await HomeScreen());
  else if (state.tab === 'trips') v.appendChild(await TripsScreen());
  else if (state.tab === 'trusted') v.appendChild(await TrustedScreen());
  else if (state.tab === 'pass') v.appendChild(await PassScreen());
  else if (state.tab === 'activity') v.appendChild(await ActivityScreen());
}

// Re-render just the home tab (used by the ride flow).
async function drawHome() { if (state.tab === 'home') { const v = $('view'); v.innerHTML = ''; v.appendChild(await HomeScreen()); } }

/* ====================================================== HOME (Uber ride flow) */
const ORIGIN = { x: 24, y: 70 };
const DEST = { x: 70, y: 30 };
const DRIVER_POS = { driver_assigned: { x: 13, y: 88 }, arrived: ORIGIN, on_trip: DEST, completed: DEST };
const STEP_MS = { driver_assigned: 4500, arrived: 3500, on_trip: 5200 };

function buildMap({ route = false, driverStatus = null } = {}) {
  const map = el(`<div class="map">
    <div class="blob" style="width:180px;height:140px;top:80px;left:-30px;"></div>
    <div class="blob" style="width:160px;height:160px;bottom:160px;right:-40px;"></div>
    <div class="road v" style="left:24%"></div>
    <div class="road v thin" style="left:62%"></div>
    <div class="road h" style="top:34%"></div>
    <div class="road h thin" style="top:68%"></div>
  </div>`);
  if (route) {
    map.appendChild(el(`<svg class="map-route" viewBox="0 0 100 100" preserveAspectRatio="none">
      <path d="M${ORIGIN.x} ${ORIGIN.y} Q 42 64 47 50 T ${DEST.x} ${DEST.y}" fill="none"
        stroke="#0a0a0a" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-dasharray="1 2.4"/>
    </svg>`));
    map.appendChild(el(`<div class="me" style="left:${ORIGIN.x}%;top:${ORIGIN.y}%"></div>`));
    map.appendChild(el(`<div class="pin-d" style="left:${DEST.x}%;top:${DEST.y}%">📍</div>`));
  } else {
    map.appendChild(el(`<div class="me" style="left:${ORIGIN.x}%;top:${ORIGIN.y}%"></div>`));
    map.appendChild(el(`<div class="pin-d" style="left:${DEST.x}%;top:${DEST.y}%">📍</div>`));
  }
  if (driverStatus) {
    const start = state.flow.prevPos || DRIVER_POS.driver_assigned;
    const target = DRIVER_POS[driverStatus] || ORIGIN;
    const m = el(`<div class="driver-marker" style="left:${start.x}%;top:${start.y}%">🛵</div>`);
    map.appendChild(m);
    requestAnimationFrame(() => { m.style.left = target.x + '%'; m.style.top = target.y + '%'; });
    state.flow.prevPos = target;
  }
  return map;
}

async function HomeScreen() {
  const f = state.flow;
  const wrap = el(`<div class="home"></div>`);

  if (f.step === 'home') {
    wrap.appendChild(buildMap());
    wrap.appendChild(await homePanel());
  } else if (f.step === 'where') {
    wrap.appendChild(buildMap());
    wrap.appendChild(await wherePanel());
  } else if (f.step === 'options') {
    wrap.appendChild(buildMap({ route: true }));
    wrap.appendChild(backBtn(() => goStep('where')));
    wrap.appendChild(await optionsPanel());
  } else if (f.step === 'finding') {
    wrap.appendChild(buildMap({ route: true }));
    wrap.appendChild(findingPanel());
  } else if (f.step === 'reassigning') {
    wrap.appendChild(buildMap({ route: true }));
    wrap.appendChild(reassigningPanel());
  } else if (['driver_assigned', 'arrived', 'on_trip'].includes(f.step)) {
    wrap.appendChild(buildMap({ route: true, driverStatus: f.step }));
    wrap.appendChild(tripPanel());
  } else if (f.step === 'completed') {
    wrap.appendChild(buildMap({ route: true, driverStatus: 'completed' }));
    wrap.appendChild(completedPanel());
  } else if (f.step === 'no_drivers') {
    wrap.appendChild(buildMap({ route: true }));
    wrap.appendChild(noDriversPanel());
  }
  return wrap;
}

function backBtn(fn) { const b = el(`<button class="map-back">←</button>`); b.addEventListener('click', fn); return b; }
function goStep(step) { state.flow.step = step; drawHome(); }
function resetFlow() {
  clearTimeout(state.flow.timer);
  state.flow = { step: 'home', ride: null, dest: null, products: null, selProd: 'moto', prompt: null, timer: null, prevPos: null };
}

/* ----- step: home (Where to?) ----- */
async function homePanel() {
  const { places } = await api.get('/places');
  const sub = (await api.get('/subscriptions/' + state.riderId)).subscription;
  const panel = el(`<div class="panel">
    <div class="grip"></div>
    <div class="spread" style="margin-bottom:14px;">
      <div class="panel-title" style="margin:0;">Good morning, Vikas</div>
      ${sub ? '<span class="pill green"><span class="dot"></span>Pass active</span>' : '<span class="pill gray">No pass</span>'}
    </div>
    <div class="search-bar" id="where"><span class="sq"></span><span>Where to?</span></div>
    <div style="margin-top:10px;" id="places"></div>
  </div>`);
  const list = panel.querySelector('#places');
  places.slice(0, 4).forEach((p) => {
    const row = el(`<div class="place-row"><div class="place-ic">${p.icon}</div>
      <div style="flex:1;"><div class="place-name">${p.name}</div><div class="place-area">${p.area}</div></div></div>`);
    row.addEventListener('click', () => pickDestination(p));
    list.appendChild(row);
  });
  panel.querySelector('#where').addEventListener('click', () => goStep('where'));
  return panel;
}

/* ----- step: where (destination picker) ----- */
async function wherePanel() {
  const { places, rider } = await api.get('/places');
  const panel = el(`<div class="panel" style="max-height:88%;">
    <div class="grip"></div>
    <div class="spread"><div class="panel-title">Plan your ride</div>
      <span class="link" id="cancel">Cancel</span></div>
    <div class="input-route">
      <div class="ir"><span class="me" style="position:static;transform:none;"></span>
        <input value="Current location · ${firstName(rider.home || 'Saket')}" readonly /></div>
      <div class="ir"><span class="sq" style="background:#000;"></span>
        <input id="destq" placeholder="Where to?" autofocus /></div>
    </div>
    <div class="section-label" style="margin-top:0;">Saved & recent</div>
    <div id="places"></div>
  </div>`);
  const list = panel.querySelector('#places');
  const renderList = (q) => {
    list.innerHTML = '';
    places.filter((p) => !q || (p.name + p.area).toLowerCase().includes(q.toLowerCase())).forEach((p) => {
      const row = el(`<div class="place-row"><div class="place-ic">${p.icon}</div>
        <div style="flex:1;"><div class="place-name">${p.name}</div><div class="place-area">${p.area}</div></div></div>`);
      row.addEventListener('click', () => pickDestination(p));
      list.appendChild(row);
    });
  };
  renderList('');
  panel.querySelector('#destq').addEventListener('input', (e) => renderList(e.target.value));
  panel.querySelector('#cancel').addEventListener('click', () => { resetFlow(); drawHome(); });
  return panel;
}

function pickDestination(place) { state.flow.dest = place; state.flow.step = 'options'; state.flow.products = null; drawHome(); }

/* ----- step: options (ride products + fares) ----- */
async function optionsPanel() {
  const f = state.flow;
  if (!f.products) {
    const data = await api.get('/rides/products');
    f.products = data.products; f.hasPass = data.hasPass;
  }
  const panel = el(`<div class="panel">
    <div class="grip"></div>
    <div class="panel-title">Choose a ride</div>
    <div class="meta" style="margin:-8px 0 12px;">to ${f.dest.name} · ${f.dest.area}</div>
    <div id="prods"></div>
    <div class="pay-row">
      <div class="pay-left">💳 <span>•••• Personal</span></div>
      <span class="link">Change</span>
    </div>
    <button class="btn" id="confirm"></button>
  </div>`);
  const prods = panel.querySelector('#prods');
  const draw = () => {
    prods.innerHTML = '';
    f.products.forEach((p) => {
      const sel = p.id === f.selProd;
      const fare = p.covered
        ? `<span class="strike">${inr(p.fare)}</span> ${inr(0)}`
        : inr(p.fare);
      const row = el(`<div class="product-row ${sel ? 'active' : ''}">
        <div class="product-ic">${p.icon}</div>
        <div style="flex:1;">
          <div class="product-name">${p.name}</div>
          <div class="product-desc">${p.desc}</div>
          ${p.covered ? '<span class="pass-tag">✓ Included in your Pass</span>' : ''}
        </div>
        <div class="product-fare">${fare}<span class="eta">${p.etaMin} min away</span></div>
      </div>`);
      row.addEventListener('click', () => { f.selProd = p.id; draw(); updateConfirm(); });
      prods.appendChild(row);
    });
  };
  const updateConfirm = () => {
    const p = f.products.find((x) => x.id === f.selProd);
    panel.querySelector('#confirm').textContent = `Choose ${p.name}`;
  };
  draw(); updateConfirm();
  panel.querySelector('#confirm').addEventListener('click', requestRide);
  return panel;
}

/* ----- step: finding driver ----- */
function findingPanel() {
  const p = state.flow.products.find((x) => x.id === state.flow.selProd);
  return el(`<div class="panel finding">
    <div class="grip"></div>
    <div class="spinner"></div>
    <div class="panel-title" style="margin-bottom:6px;">Finding your ${p.name}…</div>
    <div class="meta" style="margin-bottom:14px;">Matching you with the best available driver</div>
    <div class="pulse-line"></div>
  </div>`);
}

async function requestRide() {
  const f = state.flow;
  f.step = 'finding'; await drawHome();
  const origin = (state.me.rider.home || 'Saket');
  const res = await api.post('/rides/request', { origin, destination: f.dest.name, productId: f.selProd });
  const ride = res.data.ride;
  // Keep the finding animation visible briefly, then reveal the match.
  f.timer = setTimeout(async () => {
    f.ride = ride;
    if (ride.status === 'no_drivers' || !ride.driver) { f.step = 'no_drivers'; await drawHome(); return; }
    f.step = ride.status; // driver_assigned
    f.prevPos = DRIVER_POS.driver_assigned;
    await drawHome();
    scheduleAdvance();
  }, 1900);
}

function noDriversPanel() {
  const panel = el(`<div class="panel" style="text-align:center;">
    <div class="grip"></div>
    <div style="font-size:40px;margin:6px 0;">🛵</div>
    <div class="panel-title" style="text-align:center;">No bikes available</div>
    <p class="sub" style="text-align:center;">All drivers are offline right now. Try again in a moment.</p>
    <button class="btn" id="retry">Try again</button>
    <button class="btn ghost" id="home">Back</button>
  </div>`);
  panel.querySelector('#retry').addEventListener('click', requestRide);
  panel.querySelector('#home').addEventListener('click', () => { resetFlow(); drawHome(); });
  return panel;
}

/* ----- steps: driver_assigned / arrived / on_trip ----- */
function tripStatusText(ride) {
  const fn = firstName(ride.driver.name);
  if (ride.status === 'driver_assigned') return { msg: `${fn} is on the way`, eta: `${ride.etaMin} min` };
  if (ride.status === 'arrived') return { msg: `${fn} has arrived`, eta: 'Now' };
  return { msg: `On trip to ${state.flow.dest.name}`, eta: '~12 min' };
}

function tierBanner(ride) {
  const label = { preferred: 'Preferred driver', trusted_pool: 'Trusted pool', marketplace: 'Marketplace' }[ride.tier];
  const ic = ride.tier === 'marketplace' ? '🛵' : '🛡️';
  return `<div class="tier-banner ${ride.tier}"><span style="font-size:20px;">${ic}</span>
    <div><div style="font-weight:700;">${label}</div><div style="font-size:13px;opacity:.85;">${ride.tierMessage}</div></div></div>`;
}

function tripPanel() {
  const ride = state.flow.ride;
  const st = tripStatusText(ride);
  const showOtp = ['driver_assigned', 'arrived'].includes(ride.status);
  const panel = el(`<div class="panel">
    <div class="grip"></div>
    <div class="trip-status-bar"><span class="ts-msg">${st.msg}</span><span class="ts-eta">${st.eta}</span></div>
    ${tierBanner(ride)}
    ${showOtp ? `<div class="otp-box"><span>Start PIN</span><span class="otp-d">${ride.otp}</span></div>` : ''}
    <div class="driver-card">
      <div class="avatar lg">${ride.driver.photo}</div>
      <div style="flex:1;">
        <div class="name" style="font-size:17px;">${ride.driver.name}</div>
        <div style="margin-top:2px;">${stars(ride.driver.rating)}</div>
        <div class="meta">${ride.driver.vehicle.split(' · ')[0]}</div>
        <span class="plate">${ride.driver.vehicle.split(' · ')[1] || ''}</span>
      </div>
      <div style="text-align:right;">
        <div class="product-ic" style="font-size:30px;">${ride.product.icon}</div>
        <div class="meta">${ride.passApplied ? 'Pass ride' : inr(ride.fare)}</div>
      </div>
    </div>
    <div class="action-ico-row">
      <button id="call"><span class="ic">📞</span>Call</button>
      <button id="msg"><span class="ic">💬</span>Message</button>
      <button id="share"><span class="ic">📍</span>Share trip</button>
    </div>
    <button class="btn secondary" id="advance">Tap to continue ▸</button>
    <div class="btn-row">
      <button class="btn ghost danger-ghost" id="cancel" style="flex:1;">Cancel ride</button>
      <button class="btn ghost" id="offline" style="flex:1;color:var(--amber);">⚠︎ Driver offline</button>
    </div>
    <p class="notice" style="text-align:center;">Trip auto-advances — or tap to continue. “Driver offline” simulates the edge case.</p>
  </div>`);
  panel.querySelector('#advance').addEventListener('click', () => { clearTimeout(state.flow.timer); advanceTrip(); });
  panel.querySelector('#cancel').addEventListener('click', async () => {
    clearTimeout(state.flow.timer);
    await api.post(`/rides/${ride.id}/cancel`);
    resetFlow(); drawHome(); toast('Ride cancelled');
  });
  panel.querySelector('#offline').addEventListener('click', driverGoesOffline);
  ['call', 'msg', 'share'].forEach((id) => panel.querySelector('#' + id).addEventListener('click', () => toast('Demo action')));
  return panel;
}

/* Edge case: assigned driver goes offline mid-trip → re-match (pool → marketplace). */
function reassigningPanel() {
  return el(`<div class="panel finding">
    <div class="grip"></div>
    <div class="spinner"></div>
    <div class="panel-title" style="margin-bottom:6px;">${state.flow.droppedName} went offline</div>
    <div class="meta" style="margin-bottom:14px;">Finding you another ride on the same route…</div>
    <div class="pulse-line"></div>
  </div>`);
}

async function driverGoesOffline() {
  const f = state.flow;
  clearTimeout(f.timer);
  const dropped = firstName(f.ride.driver.name);
  f.droppedName = dropped;
  f.step = 'reassigning';
  await drawHome();
  const res = await api.post(`/rides/${f.ride.id}/driver-offline`);
  const data = res.data || {};
  f.timer = setTimeout(async () => {
    if (!data.ride || !data.ride.driver || data.ride.status === 'no_drivers') {
      if (data.ride) f.ride = data.ride;
      f.step = 'no_drivers';
      await drawHome();
      return;
    }
    f.ride = data.ride;
    f.step = data.ride.status;            // back to driver_assigned with the new driver
    f.prevPos = DRIVER_POS.driver_assigned; // new driver re-approaches pickup
    await drawHome();
    toast(`${dropped} went offline — reassigned to ${firstName(data.ride.driver.name)}`);
    scheduleAdvance();
  }, 1900);
}

function scheduleAdvance() {
  const ms = STEP_MS[state.flow.ride.status] || 4000;
  clearTimeout(state.flow.timer);
  state.flow.timer = setTimeout(advanceTrip, ms);
}

async function advanceTrip() {
  const f = state.flow;
  if (!f.ride) return;
  const res = await api.post(`/rides/${f.ride.id}/advance`);
  if (!res.ok) return;
  f.ride = res.data.ride;
  f.step = f.ride.status;
  f.prompt = res.data.prompt || f.prompt;
  await drawHome();
  if (f.step !== 'completed') scheduleAdvance();
}

/* ----- step: completed (fare + rating) ----- */
function completedPanel() {
  const ride = state.flow.ride;
  let rating = 0;
  const panel = el(`<div class="panel">
    <div class="grip"></div>
    <div class="panel-title">You've arrived 🎉</div>
    <div class="meta" style="margin:-8px 0 10px;">${ride.origin} → ${state.flow.dest.name}</div>
    <div class="fare-summary">
      ${ride.passApplied
        ? `<div class="spread"><span style="font-weight:700;">Covered by your Pass</span><span class="pill green">Ride ${ride.passRideNo}</span></div>
           <div class="meta" style="margin-top:6px;">No charge for this trip — ${inr(ride.baseFare)} saved.</div>`
        : `<div class="price-row"><span class="lbl">Trip fare</span><span class="val">${inr(ride.fare)}</span></div>
           <div class="price-row"><span class="lbl">Paid via</span><span class="val">•••• Personal</span></div>`}
    </div>
    <div style="text-align:center;font-weight:700;">Rate ${firstName(ride.driver.name)}</div>
    <div class="rate-stars" id="stars">${[1,2,3,4,5].map((i) => `<span data-v="${i}">★</span>`).join('')}</div>
    <button class="btn" id="submit" disabled>Submit rating</button>
  </div>`);
  const starsEl = panel.querySelectorAll('#stars span');
  starsEl.forEach((s) => s.addEventListener('click', () => {
    rating = Number(s.dataset.v);
    starsEl.forEach((x) => x.classList.toggle('on', Number(x.dataset.v) <= rating));
    panel.querySelector('#submit').disabled = false;
  }));
  panel.querySelector('#submit').addEventListener('click', async () => {
    await api.post(`/rides/${ride.id}/rate`, { rating });
    const prompt = state.flow.prompt;
    resetFlow();
    await navigate('home');
    if (prompt && prompt.showPrompt) postRidePrompt(prompt);
    else toast('Thanks for rating!');
  });
  return panel;
}

/* ====================================================== Post-ride trusted prompt (FR2) */
function postRidePrompt(res) {
  const d = res.driver;
  const body = el(`<div>
    <div style="text-align:center;">
      <div class="avatar lg" style="margin:0 auto 12px;">${d.photo}</div>
      <h2 class="h2" style="text-align:center;">${res.promptText}</h2>
    </div>
    <div class="card flat" style="border:1px solid var(--gray-200);">
      <div class="spread"><span class="meta">Rating</span>${stars(d.rating)}</div>
      <div class="divider"></div>
      <div class="spread"><span class="meta">Rides together</span><b>${d.ridesWithRider}</b></div>
    </div>
    <button class="btn" id="add">Add as Trusted Driver</button>
    <button class="btn ghost" id="notnow">Not now</button>
    <p class="notice" style="text-align:center;">Driver opt-in required — we'll send ${firstName(d.name)} a request.</p>
  </div>`);
  body.querySelector('#notnow').addEventListener('click', () => { closeSheet(); toast("No problem — we'll ask again later"); });
  body.querySelector('#add').addEventListener('click', () => sendInvite(d.id));
  openSheet(body);
}

async function sendInvite(driverId) {
  const res = await api.post('/trusted-drivers/invite', { riderId: state.riderId, driverId });
  if (!res.ok) {
    if (res.data.error === 'TRUSTED_DRIVER_LIMIT') return limitReachedSheet(res.data);
    return toast(res.data.message || res.data.error || 'Could not send request');
  }
  const t = res.data.trustedDriver;
  const body = el(`<div style="text-align:center;">
    <div style="font-size:46px;margin:8px 0;">📨</div>
    <h2 class="h2" style="text-align:center;">Request sent</h2>
    <p class="sub" style="text-align:center;">We've notified ${firstName(t.driver.name)}. You'll get a push when they respond.</p>
    <div class="divider"></div>
    <p class="notice">Demo: respond as the driver →</p>
    <button class="btn" id="asdriver">Open driver invite screen</button>
    <button class="btn ghost" id="done">Done</button>
  </div>`);
  body.querySelector('#done').addEventListener('click', () => { closeSheet(); navigate('trusted'); });
  body.querySelector('#asdriver').addEventListener('click', () => driverInviteScreen(t));
  openSheet(body);
}

function driverInviteScreen(t) {
  const body = el(`<div>
    <span class="pill black" style="margin-bottom:14px;">👁 Driver app view</span>
    <div style="text-align:center;">
      <div class="avatar lg" style="margin:0 auto 12px;">🧑🏽</div>
      <h2 class="h2" style="text-align:center;">${state.me.rider.name} would like to add you as a Trusted Driver</h2>
      <p class="sub" style="text-align:center;">Accept to receive priority ride requests from this rider on their commute route.</p>
    </div>
    <label class="card flat" style="display:flex;align-items:center;gap:12px;border:1px solid var(--gray-200);cursor:pointer;">
      <input type="checkbox" id="avail" checked style="width:20px;height:20px;" />
      <div><div class="name" style="font-size:15px;">Set my availability</div>
      <div class="meta">Mon–Fri mornings · helps you rank first in matching</div></div>
    </label>
    <button class="btn green" id="accept">Accept</button>
    <button class="btn ghost danger-ghost" id="decline">Decline</button>
  </div>`);
  body.querySelector('#accept').addEventListener('click', async () => {
    await api.patch(`/trusted-drivers/${t.id}/respond`, { action: 'accept', availabilitySet: body.querySelector('#avail').checked });
    closeSheet(); toast(`${firstName(t.driver.name)} is now a Trusted Driver 🎉`); navigate('trusted');
  });
  body.querySelector('#decline').addEventListener('click', async () => {
    await api.patch(`/trusted-drivers/${t.id}/respond`, { action: 'decline' });
    closeSheet(); toast(`${firstName(t.driver.name)} declined the request`); navigate('trusted');
  });
  openSheet(body);
}

function limitReachedSheet(info) {
  const body = el(`<div style="text-align:center;">
    <div style="font-size:46px;margin:8px 0;">🛡️</div>
    <h2 class="h2" style="text-align:center;">Trusted driver limit reached</h2>
    <p class="sub" style="text-align:center;">${info.message} You can have up to ${info.max} trusted drivers in the pilot.</p>
    <button class="btn" id="manage">Manage trusted drivers</button>
    <button class="btn ghost" id="cancel">Cancel</button>
  </div>`);
  body.querySelector('#manage').addEventListener('click', () => { closeSheet(); navigate('trusted'); });
  body.querySelector('#cancel').addEventListener('click', closeSheet);
  openSheet(body);
}

/* ====================================================== TRIPS (history) */
function fmtTripDate(iso) {
  try {
    return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
  } catch (e) { return iso; }
}
const tierChip = (tier) => tier === 'preferred'
  ? '<span class="pill black" style="font-size:11px;">🛡️ Preferred</span>'
  : (tier === 'trusted_pool' ? '<span class="pill green" style="font-size:11px;">🛡️ Trusted pool</span>' : '');

async function TripsScreen() {
  const { rides, stats } = await api.get('/rides');
  const wrap = el(`<div class="pad"></div>`);
  wrap.appendChild(el(`<div class="h1">Trips</div>`));
  wrap.appendChild(el(`<div class="card flat" style="border:1px solid var(--gray-200);display:flex;gap:0;padding:0;overflow:hidden;">
    <div style="flex:1;padding:16px;text-align:center;"><div style="font-size:22px;font-weight:800;">${stats.trips}</div><div class="meta">Completed trips</div></div>
    <div style="width:1px;background:var(--gray-200);"></div>
    <div style="flex:1;padding:16px;text-align:center;"><div style="font-size:22px;font-weight:800;">${inr(stats.totalSpend)}</div><div class="meta">Total spend</div></div>
  </div>`));

  if (!rides.length) {
    wrap.appendChild(el(`<div class="empty"><div class="big">📋</div><p>No trips yet. Book your first ride from Home.</p></div>`));
    return wrap;
  }

  wrap.appendChild(el(`<div class="section-label">Past rides</div>`));
  rides.forEach((r) => {
    const cancelled = r.status === 'cancelled';
    const right = cancelled
      ? '<span class="pill red" style="font-size:11px;">Cancelled</span>'
      : `<div style="text-align:right;"><div style="font-weight:700;">${r.passApplied ? 'Pass ride' : inr(r.fare)}</div>
         <div class="meta">${r.rating ? '★'.repeat(r.rating) : ''}</div></div>`;
    const card = el(`<div class="card" style="cursor:pointer;${cancelled ? 'opacity:.7;' : ''}">
      <div class="row">
        <div class="avatar sm" style="background:var(--gray-100);">${r.product.icon}</div>
        <div style="flex:1;min-width:0;">
          <div class="row" style="gap:8px;"><div class="name" style="font-size:15px;">${r.destination}</div>${tierChip(r.tier)}</div>
          <div class="meta">${fmtTripDate(r.createdAt)} · ${r.product.name}</div>
        </div>
        ${right}
      </div>
    </div>`);
    card.addEventListener('click', () => tripDetailSheet(r));
    wrap.appendChild(card);
  });
  return wrap;
}

function tripDetailSheet(r) {
  const cancelled = r.status === 'cancelled';
  const body = el(`<div>
    <h2 class="h2">${cancelled ? 'Cancelled trip' : 'Trip details'}</h2>
    <div class="meta" style="margin:-8px 0 14px;">${fmtTripDate(r.createdAt)}</div>
    <div class="route-line card flat" style="border:1px solid var(--gray-200);">
      <div class="route-dots"><div class="o"></div><div class="line"></div><div class="d"></div></div>
      <div class="route-text"><div class="o-t">${r.origin}</div><div class="gap"></div><div class="d-t">${r.destination}</div></div>
    </div>
    ${r.tier && r.tier !== 'marketplace' ? tierBanner(r) : ''}
    ${r.driver ? `<div class="card flat" style="border:1px solid var(--gray-200);">
      <div class="row"><div class="avatar">${r.driver.photo}</div>
        <div style="flex:1;"><div class="name">${r.driver.name}</div>
          <div class="meta">${r.driver.vehicle || r.product.name}</div></div>
        <div style="text-align:right;">${stars(r.driver.rating)}
          ${r.rating ? `<div class="meta">You rated ${'★'.repeat(r.rating)}</div>` : ''}</div>
      </div></div>` : ''}
    <div class="fare-summary">
      ${cancelled
        ? '<div class="spread"><span style="font-weight:700;">No charge</span><span class="pill red">Cancelled</span></div>'
        : (r.passApplied
          ? `<div class="spread"><span style="font-weight:700;">Covered by your Pass</span><span class="pill green">${inr(0)}</span></div>
             <div class="meta" style="margin-top:6px;">${inr(r.baseFare)} saved on this trip.</div>`
          : `<div class="price-row"><span class="lbl">${r.product.name} fare</span><span class="val">${inr(r.fare)}</span></div>
             <div class="price-row"><span class="lbl">Paid via</span><span class="val">•••• Personal</span></div>`)}
    </div>
    <button class="btn" id="rebook">Rebook this trip</button>
  </div>`);
  body.querySelector('#rebook').addEventListener('click', () => {
    closeSheet();
    state.flow.dest = { name: r.destination, area: '' };
    state.flow.products = null; state.flow.selProd = r.productId; state.flow.step = 'options';
    navigate('home');
  });
  openSheet(body);
}

/* ====================================================== TRUSTED (Screen 1) */
async function TrustedScreen() {
  const data = await api.get('/trusted-drivers/' + state.riderId);
  const wrap = el(`<div class="pad"></div>`);
  wrap.appendChild(el(`<div><div class="h1">Trusted Drivers</div>
    <p class="sub">Drivers you ride with again and again. ${data.count}/${data.max} slots used.</p></div>`));

  if (!data.trustedDrivers.length) {
    wrap.appendChild(el(`<div class="empty"><div class="big">🛡️</div>
      <div style="font-weight:700;font-size:17px;color:var(--ink);">No trusted drivers yet</div>
      <p>Complete 5+ rides with a top-rated driver to unlock the option to add them.</p></div>`));
  }
  data.trustedDrivers.forEach((t) => {
    const d = t.driver;
    const statusPill = t.status === 'pending'
      ? `<span class="pill amber"><span class="dot"></span>Pending</span>`
      : (d.online ? `<span class="pill green"><span class="dot"></span>Online</span>` : `<span class="pill gray">Offline</span>`);
    const card = el(`<div class="card" style="cursor:pointer;">
      <div class="row">
        <div class="avatar">${d.photo}</div>
        <div style="flex:1;">
          <div class="row" style="gap:8px;"><div class="name">${d.name}</div>${t.isPrimary ? '<span class="pill black">Preferred</span>' : ''}</div>
          <div class="meta">${stars(d.rating)} · ${d.ridesWithRider} rides together</div>
        </div>${statusPill}
      </div>
      ${t.subscription ? `<div class="pill green" style="margin-top:12px;">🎫 Pass active · ${inr(t.subscription.discountedPrice)}/mo</div>`
                       : (t.status === 'active' ? `<div class="pill gray" style="margin-top:12px;">No pass on this driver</div>` : '')}
    </div>`);
    card.addEventListener('click', () => driverProfileSheet(t));
    wrap.appendChild(card);
  });

  const atLimit = data.count >= data.max;
  const addBtn = el(`<button class="btn ${atLimit ? '' : 'secondary'}" ${atLimit ? 'disabled' : ''} style="margin-top:8px;">
    ${atLimit ? `Limit reached (${data.max}/${data.max})` : '+ Add Trusted Driver'}</button>`);
  if (!atLimit) addBtn.addEventListener('click', addTrustedSheet);
  wrap.appendChild(addBtn);
  return wrap;
}

function driverProfileSheet(t) {
  const d = t.driver;
  const body = el(`<div>
    <div style="text-align:center;">
      <div class="avatar lg" style="margin:0 auto 10px;">${d.photo}</div>
      <div class="row" style="justify-content:center;gap:8px;"><div class="name" style="font-size:20px;">${d.name}</div>${t.isPrimary ? '<span class="pill black">Preferred</span>' : ''}</div>
      <div class="meta" style="margin-top:4px;">${d.vehicle}</div>
    </div>
    <div class="card flat" style="border:1px solid var(--gray-200);margin-top:16px;">
      <div class="spread"><span class="meta">Rating</span>${stars(d.rating)}</div>
      <div class="divider"></div>
      <div class="spread"><span class="meta">Rides together</span><b>${d.ridesWithRider}</b></div>
      <div class="divider"></div>
      <div class="spread"><span class="meta">Availability</span>${d.online ? '<span class="pill green"><span class="dot"></span>Online now</span>' : '<span class="pill gray">Offline</span>'}</div>
      ${t.status === 'pending' ? '<div class="divider"></div><div class="spread"><span class="meta">Status</span><span class="pill amber">Awaiting driver response</span></div>' : ''}
    </div>
    ${t.subscription ? `<button class="btn" id="viewpass">🎫 View active pass</button>`
      : (t.status === 'active' ? `<button class="btn" id="buypass">Buy Monthly Pass</button>` : '')}
    <button class="btn ghost danger-ghost" id="remove">Remove driver</button>
  </div>`);
  const buy = body.querySelector('#buypass'); if (buy) buy.addEventListener('click', () => passPurchaseSheet(d));
  const vp = body.querySelector('#viewpass'); if (vp) vp.addEventListener('click', () => { closeSheet(); navigate('pass'); });
  body.querySelector('#remove').addEventListener('click', async () => {
    await api.del('/trusted-drivers/' + t.id);
    closeSheet(); toast(`${firstName(d.name)} removed from Trusted Drivers`); navigate('trusted');
  });
  openSheet(body);
}

async function addTrustedSheet() {
  const { drivers } = await api.get('/drivers');
  const candidates = drivers.filter((d) => !d.isTrusted);
  const body = el(`<div><h2 class="h2">Add a Trusted Driver</h2>
    <p class="sub">Only drivers who pass all eligibility checks can be added.</p><div id="list"></div></div>`);
  const list = body.querySelector('#list');
  candidates.forEach((d) => {
    const e = d.eligibility;
    const failed = e.checks.filter((c) => !c.pass);
    const card = el(`<div class="card">
      <div class="row"><div class="avatar">${d.photo}</div>
        <div style="flex:1;"><div class="name">${d.name}</div>
          <div class="meta">${stars(d.rating)} · ${d.ridesWithRider} rides together</div></div>
        ${e.eligible ? '<span class="pill green">Eligible</span>' : '<span class="pill red">Not eligible</span>'}
      </div>
      ${e.eligible ? '<button class="btn sm" style="width:100%;margin-top:12px;">Send request</button>'
                   : `<div class="notice" style="margin-top:10px;">Needs: ${failed.map((f) => f.label).join(' · ')}</div>`}
    </div>`);
    if (e.eligible) card.querySelector('button').addEventListener('click', () => sendInvite(d.id));
    list.appendChild(card);
  });
  openSheet(body);
}

/* ====================================================== PASS PURCHASE (Screen 5) */
async function passPurchaseSheet(driver, opts = {}) {
  let rides = opts.rides || 20;
  const est = await api.get(`/subscriptions/${state.riderId}/estimate?ridesPerMonth=${rides}`);
  const body = el(`<div>
    <h2 class="h2">Trusted Driver Pass</h2>
    <div class="card flat" style="border:1px solid var(--gray-200);">
      <div class="row"><div class="avatar sm">${driver ? driver.photo : '🛡️'}</div>
        <div><div class="name" style="font-size:15px;">${driver ? driver.name : 'Trusted pool'}</div>
        <div class="meta">Monthly commute pass</div></div></div>
      <div class="divider"></div>
      <div class="route-line">
        <div class="route-dots"><div class="o"></div><div class="line"></div><div class="d"></div></div>
        <div class="route-text"><div class="o-t">${est.routeOrigin}</div><div class="gap"></div><div class="d-t">${est.routeDestination}</div></div>
      </div>
    </div>
    <div class="section-label">Rides per month</div>
    <div class="stepper" style="justify-content:center;margin-bottom:8px;">
      <button id="minus">−</button><div class="v">${rides}</div><button id="plus">+</button>
    </div>
    <div class="card flat" style="border:1px solid var(--gray-200);">
      <div class="price-row"><span class="lbl">Current monthly spend</span><span class="val strike">${inr(est.basePrice)}</span></div>
      <div class="price-row"><span class="lbl">Pass price (${est.discountPct}% off)</span><span class="val">${inr(est.discountedPrice)}</span></div>
    </div>
    <div class="savings-banner">You save ${inr(est.savings)} every month 🎉</div>
    <ul class="check-list card flat" style="border:1px solid var(--gray-200);">
      <li><span class="ic ok">✓</span> Priority matching with ${driver ? firstName(driver.name) : 'trusted drivers'}</li>
      <li><span class="ic ok">✓</span> ${rides} rides on your route</li>
      <li><span class="ic ok">✓</span> Cancel anytime (end of cycle)</li>
    </ul>
    <button class="btn" id="subscribe">Subscribe — ${inr(est.discountedPrice)}/month</button>
    <label style="display:flex;gap:8px;align-items:center;justify-content:center;margin-top:10px;" class="notice">
      <input type="checkbox" id="failpay" /> Demo: simulate payment failure</label>
    <p class="notice" style="text-align:center;">Secured by Razorpay · auto-renews monthly</p>
  </div>`);
  body.querySelector('#minus').addEventListener('click', () => passPurchaseSheet(driver, { rides: Math.max(4, rides - 2) }));
  body.querySelector('#plus').addEventListener('click', () => passPurchaseSheet(driver, { rides: Math.min(60, rides + 2) }));
  body.querySelector('#subscribe').addEventListener('click', () => doSubscribe(driver, rides, body.querySelector('#failpay').checked));
  openSheet(body);
}

async function doSubscribe(driver, rides, simulateFailure) {
  const res = await api.post('/subscriptions', {
    riderId: state.riderId, driverId: driver ? driver.id : null, ridesPerMonth: rides, simulateFailure,
  });
  if (!res.ok) {
    const body = el(`<div style="text-align:center;">
      <div style="font-size:46px;margin:8px 0;">⚠️</div>
      <h2 class="h2" style="text-align:center;">Payment failed</h2>
      <p class="sub" style="text-align:center;">${(res.data.detail && res.data.detail.description) || 'Your payment could not be processed.'}</p>
      <button class="btn" id="retry">Retry payment</button>
      <button class="btn ghost" id="cancel">Cancel</button>
    </div>`);
    body.querySelector('#retry').addEventListener('click', () => passPurchaseSheet(driver, { rides }));
    body.querySelector('#cancel').addEventListener('click', closeSheet);
    return openSheet(body);
  }
  const s = res.data.subscription;
  const body = el(`<div style="text-align:center;">
    <div style="font-size:52px;margin:8px 0;">🎉</div>
    <h2 class="h2" style="text-align:center;">Pass activated!</h2>
    <p class="sub" style="text-align:center;">${inr(s.discountedPrice)}/month · ${s.routeOrigin} → ${s.routeDestination}.
      Your next ride gets priority matching.</p>
    <button class="btn" id="schedule">Set commute schedule</button>
    <button class="btn ghost" id="done">View my pass</button>
  </div>`);
  body.querySelector('#schedule').addEventListener('click', () => scheduleSheet(s));
  body.querySelector('#done').addEventListener('click', () => { closeSheet(); navigate('pass'); });
  openSheet(body);
}

function scheduleSheet(sub) {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  let chosen = new Set(['mon', 'tue', 'wed', 'thu', 'fri']);
  const body = el(`<div>
    <h2 class="h2">Commute schedule</h2>
    <p class="sub">Optional — helps us line up driver availability. We won't auto-book.</p>
    <div class="section-label">Days</div>
    <div class="row" id="days" style="flex-wrap:wrap;gap:8px;"></div>
    <div class="section-label">Pickup time</div>
    <input id="time" type="time" value="09:00" class="where-to" style="width:100%;border:1px solid var(--gray-200);background:#fff;" />
    <button class="btn" id="save" style="margin-top:18px;">Save schedule</button>
    <button class="btn ghost" id="skip">Skip for now</button>
  </div>`);
  const dwrap = body.querySelector('#days');
  days.forEach((d) => {
    const b = el(`<button class="pill ${chosen.has(d) ? 'black' : 'gray'}" style="border:0;cursor:pointer;text-transform:uppercase;">${d}</button>`);
    b.addEventListener('click', () => { chosen.has(d) ? chosen.delete(d) : chosen.add(d); b.className = `pill ${chosen.has(d) ? 'black' : 'gray'}`; b.style.cursor = 'pointer'; });
    dwrap.appendChild(b);
  });
  body.querySelector('#skip').addEventListener('click', () => { closeSheet(); navigate('pass'); });
  body.querySelector('#save').addEventListener('click', async () => {
    await api.post('/schedules', { subscriptionId: sub.id, daysOfWeek: [...chosen], pickupTime: body.querySelector('#time').value });
    closeSheet(); toast('Commute schedule saved'); navigate('pass');
  });
  openSheet(body);
}

/* ====================================================== PASS DASHBOARD (Screen 6) */
async function PassScreen() {
  const sub = (await api.get('/subscriptions/' + state.riderId)).subscription;
  const wrap = el(`<div class="pad"></div>`);
  wrap.appendChild(el(`<div class="h1">Your Pass</div>`));

  if (!sub) {
    wrap.appendChild(el(`<div class="empty"><div class="big">🎫</div>
      <div style="font-weight:700;font-size:17px;color:var(--ink);">No active pass</div>
      <p>Buy a monthly pass on one of your trusted drivers to save on your commute.</p></div>`));
    const b = el(`<button class="btn secondary">Go to Trusted Drivers</button>`);
    b.addEventListener('click', () => navigate('trusted'));
    wrap.appendChild(b);
    return wrap;
  }
  const schedule = (await api.get('/schedules/' + sub.id)).schedule;
  const pct = Math.min(100, Math.round((sub.ridesUsed / sub.ridesPerMonth) * 100));
  const statusPill = sub.status === 'active' ? '<span class="pill green"><span class="dot"></span>Active</span>'
    : '<span class="pill amber">Cancelled · active till cycle end</span>';

  wrap.appendChild(el(`<div class="card" style="background:var(--ink);color:#fff;border:0;">
    <div class="spread"><span style="font-weight:700;font-size:17px;">Trusted Driver Pass</span>${statusPill}</div>
    <div style="margin:14px 0 6px;font-size:13px;opacity:.7;">${sub.routeOrigin} → ${sub.routeDestination}</div>
    <div style="font-size:30px;font-weight:800;letter-spacing:-.03em;">${inr(sub.discountedPrice)}<span style="font-size:14px;font-weight:600;opacity:.7;">/month</span></div>
    ${sub.driver ? `<div style="margin-top:12px;" class="row"><div class="avatar sm">${sub.driver.photo}</div><div>Preferred: ${sub.driver.name}</div></div>` : '<div style="margin-top:12px;opacity:.8;">Trusted pool pass</div>'}
  </div>`));
  wrap.appendChild(el(`<div class="card flat" style="border:1px solid var(--gray-200);">
    <div class="spread"><span class="meta">Rides used this cycle</span><b>${sub.ridesUsed} / ${sub.ridesPerMonth}</b></div>
    <div class="bar"><span style="width:${pct}%"></span></div>
    <div class="divider"></div>
    <div class="spread"><span class="meta">You're saving</span><b style="color:var(--green-ink);">${inr(sub.basePrice - sub.discountedPrice)}/mo</b></div>
    <div class="divider"></div>
    <div class="spread"><span class="meta">Next billing date</span><b>${sub.billingCycle}</b></div>
    <div class="divider"></div>
    <div class="spread"><span class="meta">Auto-renew</span>${sub.autoRenew ? '<span class="pill green">On</span>' : '<span class="pill gray">Off</span>'}</div>
  </div>`));
  if (schedule) {
    wrap.appendChild(el(`<div class="card flat" style="border:1px solid var(--gray-200);">
      <div class="section-label" style="margin-top:0;">Commute schedule</div>
      <div class="row" style="flex-wrap:wrap;gap:6px;">${schedule.daysOfWeek.map((d) => `<span class="pill gray" style="text-transform:uppercase;">${d}</span>`).join('')}</div>
      <div class="meta" style="margin-top:10px;">Pickup around ${schedule.pickupTime}</div></div>`));
  }
  if (sub.status === 'active') {
    wrap.appendChild(el(`<p class="notice" style="text-align:center;">Cancelling takes effect at the end of the cycle. No refund in the pilot.</p>`));
    const cancel = el(`<button class="btn ghost danger-ghost">Cancel pass</button>`);
    cancel.addEventListener('click', async () => {
      const res = await api.patch('/subscriptions/' + sub.id + '/cancel');
      toast(res.data.note || 'Pass cancelled'); navigate('pass');
    });
    wrap.appendChild(cancel);
  }
  return wrap;
}

/* ====================================================== ACTIVITY (notifications) */
async function ActivityScreen() {
  const { notifications } = await api.get('/notifications');
  const wrap = el(`<div class="pad"></div>`);
  wrap.appendChild(el(`<div class="h1">Activity</div><p class="sub">Trusted Driver Pass updates.</p>`));
  if (!notifications.length) {
    wrap.appendChild(el(`<div class="empty"><div class="big">🔔</div><p>No notifications yet.</p></div>`));
    return wrap;
  }
  const icon = { invite_sent: '📨', invite_accepted: '✅', invite_declined: '❌', pass_purchased: '🎫', pass_cancelled: '🚫', ride_matched: '🛡️', driver_offline: '⚠️' };
  notifications.forEach((n) => {
    wrap.appendChild(el(`<div class="feed-item"><div class="ico">${icon[n.event] || '🔔'}</div>
      <div><div class="ft">${n.message}</div><div class="fc">to ${n.recipient} · ${n.channels.join(' + ')}</div></div></div>`));
  });
  return wrap;
}

/* ---------------- go ---------------- */
const TABS = ['home', 'trips', 'trusted', 'pass', 'activity'];
const startTab = (location.hash || '').replace('#', '');
navigate(TABS.includes(startTab) ? startTab : 'home');
