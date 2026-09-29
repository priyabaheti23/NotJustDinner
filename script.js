'use strict';

/* ═══════════════════════════════════════
   CONFIG
═══════════════════════════════════════ */
// Two environments, one codebase:
//   PRODUCTION -> the live site (notjustdinner.in). Live sheet + live Razorpay keys.
//   UAT        -> this site opened on your own computer (localhost, 127.0.0.1 or
//                 straight from the file), or any URL with ?env=uat. Uses the
//                 "NJD Supper Club Bookings - UAT" sheet + Razorpay TEST keys, so
//                 no real money moves and the live sheet is never touched.
const BACKEND_URLS = {
  production: 'https://script.google.com/macros/s/AKfycbwDaM6f1PEJkCVk8ydRi4j65pZALJnyacRQaMTg2Tz8q6NhPHKwnYcSXL27mXjLWjTQcw/exec',
  uat       : 'https://script.google.com/macros/s/AKfycby8bQEzsO57oagYTyFSCvcoMD3seP0L2-1vnd_TmkWGXfr3L-k8FGnFFX3znZm_pT8Q/exec'   // "UAT - Razorpay Backend" web app URL
};
const IS_UAT = /^(localhost|127\.0\.0\.1|)$/.test(location.hostname) || /[?&]env=uat\b/.test(location.search);
const BACKEND_URL = IS_UAT ? BACKEND_URLS.uat : BACKEND_URLS.production;

// Every backend call goes through here. Apps Script occasionally answers with
// a Google "unable to open the file" HTML page instead of JSON (a transient
// hiccup on Google's side), so a non-JSON or failed answer is retried a few
// times before giving up. The backend makes verifyBooking safe to repeat.
function backendJSON_(body, tries, query) {
  // Hedged requests: the backend itself answers in ~2 s, but Google's relay
  // sometimes sits on the answer for 15-30 s. So if nothing has come back
  // after HEDGE_MS, a second identical request goes out while the first keeps
  // waiting -- whichever answers first wins and the other is cancelled. A
  // failed attempt is replaced straight away. Every call is safe to send
  // twice (createOrder carries a checkoutId, verifyBooking is idempotent).
  const HEDGE_MS = 6000, GIVE_UP_MS = 45000;
  tries = tries || 3;
  return new Promise((resolve, reject) => {
    let done = false, started = 0, failed = 0, lastErr = null, hedgeTimer = null;
    const ctrls = [];
    const finish = (fn, v) => {
      if (done) return;
      done = true;
      clearTimeout(hedgeTimer); clearTimeout(giveUp);
      ctrls.forEach(c => { try { c.abort(); } catch (e) {} });
      fn(v);
    };
    const launch = () => {
      if (done || started >= tries) return;
      started++;
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      if (ctrl) ctrls.push(ctrl);
      const opts = body ? { method: 'POST', body: JSON.stringify(body) } : {};
      if (ctrl) opts.signal = ctrl.signal;
      fetch(BACKEND_URL + (query || ''), opts)
        .then(r => r.text())
        .then(t => finish(resolve, JSON.parse(t)))
        .catch(err => {
          if (done) return;
          failed++; lastErr = err;
          console.warn('[NJD] backend attempt failed (' + failed + '/' + tries + ')', err);
          if (failed >= tries) finish(reject, lastErr);
          else setTimeout(launch, 400);
        });
      clearTimeout(hedgeTimer);
      if (started < tries) hedgeTimer = setTimeout(launch, HEDGE_MS);
    };
    const giveUp = setTimeout(() => finish(reject, lastErr || new Error('Backend timed out')), GIVE_UP_MS);
    launch();
  });
}
const MAX_SEATS   = 8;
let   PRICE       = 3000;   // per seat; the backend's own PRICE overrides this on load
const WA_NUMBER   = '917218132167';   // waitlist / larger-group WhatsApp

/* ═══════════════════════════════════════
   ATTRIBUTION
   Remembers which ad or post sent this
   visitor, so a booking row can be traced
   back to the campaign that paid for it.
   Best-effort: private mode may block
   sessionStorage, and that must never
   break checkout.
═══════════════════════════════════════ */
const UTM_KEYS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];

(function captureAttribution() {
  try {
    const p = new URLSearchParams(location.search);
    UTM_KEYS.forEach(k => { const v = p.get(k); if (v) sessionStorage.setItem(k, v); });
    if (!sessionStorage.getItem('njd_referrer') && document.referrer) {
      sessionStorage.setItem('njd_referrer', document.referrer);
    }
  } catch (e) { /* attribution is optional — never block the page */ }
})();

function getAttribution() {
  const out = {};
  try {
    UTM_KEYS.forEach(k => { const v = sessionStorage.getItem(k); if (v) out[k] = v; });
    const ref = sessionStorage.getItem('njd_referrer');
    if (ref) out.referrer = ref;
  } catch (e) {}
  return out;
}

/* ═══════════════════════════════════════
   PIXEL — thin wrapper so a blocked or
   missing fbq can never throw mid-checkout.
═══════════════════════════════════════ */
/* ═══════════════════════════════════════
   RAZORPAY — loaded on demand.
   checkout.js is ~170KB of JavaScript that
   is useless until someone actually pays,
   so it no longer blocks the first render.
   Warmed when a guest reaches the pay step
   and awaited before checkout opens, so the
   wait is almost always already over.
═══════════════════════════════════════ */
let razorpayPromise = null;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (razorpayPromise) return razorpayPromise;
  razorpayPromise = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src   = 'https://checkout.razorpay.com/v1/checkout.js';
    el.async = true;
    el.onload  = () => resolve();
    el.onerror = () => { razorpayPromise = null; reject(new Error('checkout script failed to load')); };
    document.head.appendChild(el);
  });
  return razorpayPromise;
}

function track(event, params) {
  if (IS_UAT) return;                  // test runs never reach the live Pixel
  try { if (typeof fbq === 'function') fbq('track', event, params || {}); } catch (e) {}
}
function trackCustom(event, params) {
  if (IS_UAT) return;
  try { if (typeof fbq === 'function') fbq('trackCustom', event, params || {}); } catch (e) {}
}

/* ═══════════════════════════════════════
   DATE FORMATTING
═══════════════════════════════════════ */
function dateFromKey_(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function prettyDate_(key) {
  return dateFromKey_(key).toLocaleDateString('en-IN',
    { weekday: 'long', day: 'numeric', month: 'long' });
}
function prettyDateShort_(key) {
  return dateFromKey_(key).toLocaleDateString('en-IN',
    { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let selectedDate = null;
let availability = {};
let gCount       = 1;
let wizStep      = 1;
let appliedCoupon = null; // { code, discountPercent } — Community Dining only
let calMonthOffset = 0;         // index into calMonths_()
const MAX_CAL_MONTHS_AHEAD = 1; // default: how many months ahead guests can browse/book

// Pin the calendar to specific months ('YYYY-MM'). While any listed month
// still has days left, ONLY those months are shown (no arrows to other
// months); past days inside them still grey out as usual. Once they have
// all ended, the calendar falls back to the default rolling behaviour.
// Leave the list empty [] for the default.
const BOOKING_MONTHS = ['2026-10'];

// Can guests book an evening on the same day? false = bookings for a date
// close at midnight before it. (The backend enforces the same rule.)
const SAME_DAY_BOOKING = true;

// "Today" in India time, whatever the visitor's own clock says, returned as
// a local-midnight Date so it compares cleanly with the calendar's dates.
function todayIST_() {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date()).split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  } catch (e) {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
}

// Last date that can no longer be booked (today, or yesterday if same-day is on).
function isClosedDate_(d) {
  const t = todayIST_();
  return SAME_DAY_BOOKING ? d < t : d <= t;
}

function calMonths_() {
  const now   = new Date();
  const today = todayIST_();
  const pinned = BOOKING_MONTHS
    .map(s => { const [y, m] = s.split('-').map(Number); return { y: y, m: m - 1 }; })
    .filter(v => new Date(v.y, v.m + 1, 0) >= today);   // month not over yet
  if (pinned.length) return pinned;
  const out = [];
  for (let off = 0; off <= MAX_CAL_MONTHS_AHEAD; off++) {
    const d = new Date(now.getFullYear(), now.getMonth() + off, 1);
    out.push({ y: d.getFullYear(), m: d.getMonth() });
  }
  return out;
}

/* ═══════════════════════════════════════
   DATE OVERRIDES
   Every Saturday is open by default. List a
   date here to change just that one evening:
     status 'closed' -> no supper club that evening; just shows `label`
                        (not clickable, no waitlist)
     status 'event'  -> a special evening that can't be booked online;
                        tapping it opens the modal named in `modal`
   Remove a line to put that Saturday back to normal.
   `showFrom: 'YYYY-MM-DD'` keeps the label/popup hidden until that date
   (India time); before it the evening just shows as not bookable.
═══════════════════════════════════════ */
// Special evenings now live in the sheet's "Calendar" tab
// (Date | Type | Label | Show From | Popup Title | Popup Text) and arrive with
// the seat counts. These built-in rows are only the fallback for a first
// visit before the backend answers, or an older backend without a Calendar.
let DATE_OVERRIDES = {
  '2026-10-03': { status: 'closed', label: "Founder's Birthday" },
  '2026-10-31': { status: 'event',  label: 'Diwali Party', showFrom: '2026-10-01' },
};
const CALENDAR_CACHE_KEY = 'njd_calendar_v1';

function applyCalendarRows_(rows) {
  if (!Array.isArray(rows)) return false;
  const next = {};
  rows.forEach(r => {
    if (!r || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return;
    const type = String(r.type || '').toLowerCase();
    if (type !== 'closed' && type !== 'event') return;
    next[r.date] = {
      status    : type,
      label     : r.label || '',
      showFrom  : r.showFrom || '',
      popupTitle: r.popupTitle || '',
      popupText : r.popupText || ''
    };
  });
  DATE_OVERRIDES = next;
  return true;
}
// Paint last visit's calendar straight away, if we have one.
try { applyCalendarRows_(JSON.parse(localStorage.getItem(CALENDAR_CACHE_KEY) || 'null')); } catch (e) {}

// Seats still bookable on a date, after overrides.
// The override for a date, or a plain "closed" one if its showFrom is still ahead.
function overrideFor_(key) {
  const o = DATE_OVERRIDES[key];
  if (!o) return null;
  if (o.showFrom && dateFromKey_(o.showFrom) > todayIST_()) return { status: 'closed', label: '' };
  return o;
}

function seatsLeft_(key) {
  if (DATE_OVERRIDES[key]) return 0;
  return MAX_SEATS - (availability[key] || 0);
}

/* ═══════════════════════════════════════
   MODAL
═══════════════════════════════════════ */
window.openModal = function (id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'flex';
  document.body.style.overflow = 'hidden';
};
window.closeModal = function (id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'none';
  document.body.style.overflow = 'auto';
};

/* ═══════════════════════════════════════
   AVAILABILITY
═══════════════════════════════════════ */
/* The Apps Script backend answers in roughly 2-8 seconds -- that is Google's
   cold start, not something the page can speed up. So the page stops waiting
   on it: the calendar paints immediately with the real month and dates, and
   only the seat counts arrive late. Three things shorten the visible wait:
     1. the request starts at parse time, not on DOMContentLoaded
     2. <link rel=preconnect> has already done DNS + TLS by then
     3. an answer from earlier in this session paints instantly from cache   */

let availabilityState = 'loading';           // 'loading' | 'ready' | 'failed'
const AVAIL_CACHE_KEY = 'njd_avail_v2';
const AVAIL_CACHE_MS  = 30 * 60 * 1000;      // paint a recent answer instantly, then refresh
// Guests never wait on the backend: Saturdays are bookable from the first
// paint and the seat badges fill in when the answer lands. Checkout
// re-checks capacity server-side, so an optimistic pick can't overbook.

// Kick the request off the moment this file is parsed.
// One call brings both the seat counts and the coupon list (the backend
// answers { availability, coupons } when asked with ?with=coupons; an older
// backend just returns the counts, which is handled too).
let prefetchedCoupons = null;
let backendPrice       = null;   // price the backend will actually charge
const availabilityRequest = backendJSON_(null, 3, '?with=coupons')
  .then(d => {
    if (d && d.availability) {
      if (Array.isArray(d.coupons)) prefetchedCoupons = d.coupons;
      if (Number(d.price) > 0) backendPrice = Number(d.price);
      if (applyCalendarRows_(d.calendar)) {
        try { localStorage.setItem(CALENDAR_CACHE_KEY, JSON.stringify(d.calendar)); } catch (e) {}
      }
      return d.availability;
    }
    return d;
  })
  .catch(() => null);

function normaliseAvailability_(data) {
  const out = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    let dateKey = key;
    if (key.includes('GMT') || key.includes('Apr') || key.includes('2026')) {
      const d = new Date(key);
      if (!isNaN(d)) {
        const y   = d.getFullYear();
        const m   = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dateKey   = `${y}-${m}-${day}`;
      }
    }
    out[dateKey] = (out[dateKey] || 0) + value;
  });
  return out;
}

function applyAvailability_(data, fromCache) {
  availability      = normaliseAvailability_(data);
  availabilityState = 'ready';
  if (!fromCache) {
    try {
      localStorage.setItem(AVAIL_CACHE_KEY, JSON.stringify({ t: Date.now(), d: data }));
    } catch (e) { /* private mode — caching is a bonus, never required */ }
  }
  // If the evening picked before the counts arrived has since filled up,
  // move the guest to the next open one instead of failing at checkout.
  if (selectedDate && seatsLeft_(selectedDate) <= 0) {
    selectedDate = null;
    applyCalDefaults();
    if (selectedDate) showErr('cal-err', `That evening just filled up \u2014 we\u2019ve moved you to ${prettyDateShort_(selectedDate)}.`);
  } else if (selectedDate && seatsLeft_(selectedDate) < gCount) {
    showErr('cal-err', `Only ${seatsLeft_(selectedDate)} seat(s) left for this date. Reduce guests or pick another evening.`);
  }
  applyCalDefaults();
  buildCal();
}

function fetchAvailability() {
  // Paint from this session's cache first, if it is fresh enough.
  try {
    const raw = localStorage.getItem(AVAIL_CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && c.d && (Date.now() - c.t) < AVAIL_CACHE_MS) applyAvailability_(c.d, true);
    }
  } catch (e) {}

  availabilityRequest.then(data => {
    if (data) { applyAvailability_(data, false); return; }
    if (availabilityState !== 'ready') {
      // Backend unreachable. Show every upcoming Saturday as open rather than
      // an empty calendar; checkout will surface the real error if it is down.
      availabilityState = 'failed';
      applyCalDefaults();
      buildCal();
    }
  });
}

/* ═══════════════════════════════════════
   CALENDAR
   - Week starts Monday (Mon=0 … Sun=6 in our grid)
   - Only OPEN_DATES are bookable (specific evenings,
     not every Saturday/Sunday in the month)
   - Past dates greyed and unclickable
   - Month heading computed dynamically
═══════════════════════════════════════ */

// Every Saturday of the current month is open for booking — computed live
// below so this rolls forward automatically each month with no manual edits.
function getSaturdaysOfMonth_(year, month) {
  const dates = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month, d).getDay() === 6) {
      dates.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  }
  return dates;
}

function buildCal() {
  const grid = document.getElementById('cal-comm');
  if (!grid) return;

  // Keep the 7 day-label headers, remove old day cells
  while (grid.children.length > 7) grid.removeChild(grid.lastChild);

  const now       = new Date();
  const today     = todayIST_();

  // ── Event month — current month by default. Guests can page/swipe
  //    forward up to MAX_CAL_MONTHS_AHEAD months to book ahead once this
  //    month's Saturdays fill up or pass — no manual date edits needed. ──
  const months     = calMonths_();
  calMonthOffset   = Math.max(0, Math.min(calMonthOffset, months.length - 1));
  const viewYear   = months[calMonthOffset].y;
  const viewMonth  = months[calMonthOffset].m;
  const OPEN_DATES = getSaturdaysOfMonth_(viewYear, viewMonth);

  // Update heading
  const monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
  const headEl = document.getElementById('cal-head');
  if (headEl) headEl.textContent = `${monthNames[viewMonth]} ${viewYear}`;

  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');
  if (prevBtn) prevBtn.disabled = calMonthOffset <= 0;
  if (nextBtn) nextBtn.disabled = calMonthOffset >= months.length - 1;
  const navRow = prevBtn && prevBtn.parentElement;
  if (navRow) navRow.classList.toggle('single', months.length === 1);

  // ── Mon-first offset ─────────────────────────
  // JS getDay(): Sun=0, Mon=1 … Sat=6
  // We want:     Mon=0, Tue=1 … Sun=6
  const jsFirstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const monFirstOffset = (jsFirstDay + 6) % 7;

  for (let i = 0; i < monFirstOffset; i++) {
    const e = document.createElement('div');
    e.className = 'day empty';
    grid.appendChild(e);
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const cell      = document.createElement('div');
    const thisDate  = new Date(viewYear, viewMonth, d);
    const jsDay     = thisDate.getDay();          // 0=Sun … 6=Sat
    const isWeekend = jsDay === 6 || jsDay === 0;
    const isPast    = isClosedDate_(thisDate);
    const key       = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isOpen    = OPEN_DATES.includes(key);

    cell.innerHTML = `<span class="day-num">${d}</span>`;

    const override  = overrideFor_(key);

    if (isPast) {
      cell.className = 'day past';
    } else if (override && override.status === 'closed') {

      // No supper club that night — a label only, nothing to click.
      cell.className = override.label ? 'day closed' : 'day other';
      if (override.label) cell.innerHTML += `<span class="day-seats">${escapeHtml(override.label)}</span>`;
      cell.setAttribute('aria-label', `${prettyDate_(key)} \u2014 ${override.label || 'not open for booking'}.`);

    } else if (override && override.status === 'event') {

      // A special evening — not bookable here, opens its own popup.
      cell.className = 'day event';
      cell.innerHTML += `<span class="day-seats">${escapeHtml(override.label || 'Event')}</span>`;
      cell.setAttribute('role', 'button');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('title', `${override.label || 'Special evening'} \u2014 tap to find out more`);
      cell.setAttribute('aria-label', `${prettyDate_(key)} \u2014 ${override.label || 'special evening'}. Tap for details.`);
      cell.onclick   = () => openEventDate(key);
      cell.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEventDate(key); } };

    } else if (isOpen) {

      const remaining = seatsLeft_(key);

      if (remaining <= 0) {
        // A sold-out night is the highest-intent cell on the page.
        // Route it to WhatsApp instead of letting it dead-end.
        cell.className = 'day full';
        cell.innerHTML += `<span class="day-seats">Notify me</span>`;
        cell.setAttribute('role', 'button');
        cell.setAttribute('tabindex', '0');
        cell.setAttribute('title', 'Fully booked \u2014 tap to be told when a seat opens');
        cell.setAttribute('aria-label', `${prettyDate_(key)} is fully booked. Tap to join the waitlist.`);
        cell.onclick   = () => notifyForDate(key);
        cell.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); notifyForDate(key); } };
      } else if (remaining === 1) {
        cell.className = 'day avail last-one';
        cell.innerHTML += `<span class="day-seats">Last seat!</span>`;
        cell.onclick   = () => selectDate(key, cell, remaining);
      } else if (remaining === 2) {
        cell.className = 'day avail last-two';
        cell.innerHTML += `<span class="day-seats">2 left</span>`;
        cell.onclick   = () => selectDate(key, cell, remaining);
      } else if (remaining === 3) {
        cell.className = 'day avail almost';
        cell.innerHTML += `<span class="day-seats">Almost full</span>`;
        cell.onclick   = () => selectDate(key, cell, remaining);
      } else if (remaining === 4) {
        cell.className = 'day avail filling';
        cell.innerHTML += `<span class="day-seats">Filling fast</span>`;
        cell.onclick   = () => selectDate(key, cell, remaining);
      } else {
        cell.className = 'day avail';
        cell.onclick   = () => selectDate(key, cell, remaining);
      }

    } else if (isWeekend) {
      // Weekend but not one of the open evenings this edition
      cell.className = 'day other';
    } else {
      cell.className = 'day other';
    }

    if (cell.onclick && !cell.getAttribute('aria-label')) {
      cell.setAttribute('role', 'button');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('aria-label',
        `${prettyDate_(key)} \u2014 ${seatsLeft_(key)} seats available`);
      cell.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cell.click(); }
      };
    }
    if (key === selectedDate) {
      cell.classList.add('sel');
      cell.setAttribute('aria-current', 'true');
    }

    grid.appendChild(cell);
  }

  const loading = document.getElementById('cal-loading');
  if (loading) loading.style.display = 'none';

  updateOfferLine();
}

/* ═══════════════════════════════════════
   CALENDAR DEFAULTS
   Opens the calendar on the first month
   that actually has a bookable Saturday and
   pre-selects the nearest one, so an ad
   visitor never lands on a sold-out grid
   with a dead Continue button.
   Only ever runs when nothing is selected,
   so it can't override a guest's own pick
   or fight the month arrows.
═══════════════════════════════════════ */
function firstOpenDate_() {
  const now   = new Date();
  const today = todayIST_();
  const months = calMonths_();
  for (let off = 0; off < months.length; off++) {
    const keys = getSaturdaysOfMonth_(months[off].y, months[off].m);
    for (const key of keys) {
      if (isClosedDate_(dateFromKey_(key))) continue;
      if (seatsLeft_(key) > 0) return { offset: off, key: key };
    }
  }
  return null;
}

function applyCalDefaults() {
  if (selectedDate) return;
  const first = firstOpenDate_();
  if (!first) return;
  calMonthOffset = first.offset;
  selectedDate   = first.key;
  const nextBtn = document.getElementById('wiz-next-1');
  if (nextBtn) nextBtn.disabled = false;
}

/* ═══════════════════════════════════════
   OFFER LINE — the next bookable date and
   seats left, shown under the hero and in
   the sticky bar. Reads the same
   availability data as the calendar, so it
   can never go stale.
═══════════════════════════════════════ */
function updateOfferLine() {
  const stripEl   = document.getElementById('strip-next');
  const stickyTxt = document.getElementById('sticky-cta-txt');

  const target    = selectedDate && seatsLeft_(selectedDate) > 0
                    ? selectedDate
                    : (firstOpenDate_() || {}).key;

  if (!target) {
    if (stripEl)   stripEl.textContent   = 'Next dates announced soon';
    if (stickyTxt) stickyTxt.textContent = `Reserve \u00B7 \u20B9${PRICE.toLocaleString('en-IN')}`;
    return;
  }

  if (stripEl)   stripEl.textContent   = `Next: ${prettyDateShort_(target)}`;
  if (stickyTxt) stickyTxt.textContent = `${prettyDateShort_(target)} \u00B7 Reserve \u20B9${PRICE.toLocaleString('en-IN')}`;
}

/* ═══════════════════════════════════════
   WAITLIST — a full date opens WhatsApp
   with the date pre-filled. No backend
   change needed, and it starts the
   conversation where the social handle can
   be asked for naturally.
═══════════════════════════════════════ */
window.notifyForDate = function (key) {
  track('Lead', { content_name: 'waitlist', content_category: key });
  const msg = `Hi! ${prettyDate_(key)} is showing as full \u2014 could you let me know if a seat opens up, or when the next date goes live?`;
  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
};

/* ═══════════════════════════════════════
   EVENT DATES — e.g. the Diwali party.
   Opens the event's popup.
═══════════════════════════════════════ */
let eventDateKey = null;
window.openEventDate = function (key) {
  const o = DATE_OVERRIDES[key];
  if (!o) return;
  eventDateKey = key;
  const set = (id, txt) => { const el = document.getElementById(id); if (el && txt) el.textContent = txt; };
  set('me-date',  dateFromKey_(key).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }));
  set('me-title', o.popupTitle || (o.label ? `${o.label} at Not Just Dinner` : ''));
  set('me-body',  o.popupText);
  trackCustom('EventInterest', { content_name: o.label || 'event', content_category: key });
  openModal('m-event');
};
// A code's uses are counted per seat, so 3 guests need 3 uses left.
// The page applies a code instantly from the list it loaded; this then asks
// the backend quietly in the background (live seat count, guest count, one
// use per WhatsApp number). If the backend says no, the coupon comes off with
// its reason -- well before the guest reaches Pay.
let couponCheckSeq = 0;
function confirmCouponInBackground_() {
  if (!appliedCoupon) return;
  const seq  = ++couponCheckSeq;
  const code = appliedCoupon.code;
  backendJSON_({ action: 'validateCoupon', code: code, guestCount: gCount, whatsapp: val('guest_wa_1') })
    .then(data => {
      if (seq !== couponCheckSeq || !appliedCoupon || appliedCoupon.code !== code) return;
      if (data && data.valid === false) {
        appliedCoupon = null;
        const msg = document.getElementById('coupon-msg');
        if (msg) {
          msg.textContent   = data.error || 'That coupon code is not valid.';
          msg.className     = 'coupon-msg err';
          msg.style.display = 'block';
        }
        updatePriceDisplay();
        couponListRequest = null;          // our list was out of date -- refresh it
        fetchCouponList_();
      }
    })
    .catch(() => { /* network trouble: the backend still checks at Pay */ });
}

function recheckCouponForGuests_() {
  if (!appliedCoupon) return;
  const known = (couponListCache || []).find(c => c.code === appliedCoupon.code);
  if (!known || known.remaining === null || known.remaining >= gCount) { confirmCouponInBackground_(); return; }
  const r   = known.remaining;
  const msg = document.getElementById('coupon-msg');
  appliedCoupon = null;
  if (msg) {
    msg.textContent = r > 0
      ? `"${known.code}" has only ${r} seat${r > 1 ? 's' : ''} left \u2014 removed for ${gCount} guests.`
      : `"${known.code}" has just been fully claimed.`;
    msg.className = 'coupon-msg err';
    msg.style.display = 'block';
  }
}

/* ═══════════════════════════════════════
   OFFERS POPUP — lists the coupons from
   the Coupons sheet (backend listCoupons).
   Tap one to apply it. Codes that have hit
   Max Uses show as "Fully claimed" and
   can't be tapped. The backend still
   re-checks everything at checkout.
═══════════════════════════════════════ */
const COUPON_CACHE_KEY = 'njd_coupons_v1';
const COUPON_CACHE_MS  = 5 * 60 * 1000;
let couponListRequest = null;
let couponListCache   = null;           // last answer, shown instantly
try {
  const c = JSON.parse(localStorage.getItem(COUPON_CACHE_KEY) || 'null');
  if (c && Array.isArray(c.d) && (Date.now() - c.t) < COUPON_CACHE_MS) couponListCache = c.d;
} catch (e) {}

function fetchCouponList_() {
  if (!couponListRequest && !couponListCache && prefetchedCoupons) {
    couponListCache = prefetchedCoupons;
  }
  if (!couponListRequest) {
    couponListRequest = backendJSON_({ action: 'listCoupons' })
      .then(d => {
        const list = (d && Array.isArray(d.coupons)) ? d.coupons : [];
        couponListCache = list;
        try { localStorage.setItem(COUPON_CACHE_KEY, JSON.stringify({ t: Date.now(), d: list })); } catch (e) {}
        return list;
      })
      .catch(() => { couponListRequest = null; return couponListCache; });
  }
  return couponListRequest;
}

function renderCouponList_(coupons) {
  const list = document.getElementById('offers-list');
  if (!list) return;
  if (coupons === null) {
    list.innerHTML = '<p class="offers-empty">Couldn\u2019t load offers \u2014 please try again.</p>';
    return;
  }
  if (!coupons.length) {
    list.innerHTML = '<p class="offers-empty">No offers running right now.</p>';
    return;
  }
  const current = appliedCoupon ? appliedCoupon.code : '';
  list.innerHTML = coupons.map(c => {
    const code = escapeHtml(c.code);
    const left = (c.available && c.remaining !== null && c.remaining <= 3)
      ? `<span class="offer-left">Only ${c.remaining} seat${c.remaining > 1 ? 's' : ''} left</span>` : '';
    if (!c.available) {
      return `<div class="offer-card used" aria-disabled="true">
        <div class="offer-main"><span class="offer-pct">${c.discountPercent}% off</span><span class="offer-code">${code}</span></div>
        <span class="offer-state">Fully claimed</span>
      </div>`;
    }
    const on = current === c.code;
    return `<button type="button" class="offer-card${on ? ' on' : ''}" onclick="pickCoupon('${code}')">
        <div class="offer-main"><span class="offer-pct">${c.discountPercent}% off</span><span class="offer-code">${code}</span></div>
        ${left}<span class="offer-state">${on ? 'Applied' : 'Tap to apply'}</span>
      </button>`;
  }).join('');
}

window.openOffers = async function () {
  openModal('m-offers');
  if (couponListCache) {
    renderCouponList_(couponListCache);           // instant, from the prefetch
  } else {
    const list = document.getElementById('offers-list');
    if (list) list.innerHTML = '<p class="offers-empty">Loading offers\u2026</p>';
  }
  const fresh = await fetchCouponList_();          // refresh counts in the background
  if (document.getElementById('m-offers').style.display !== 'none') renderCouponList_(fresh);
};

window.pickCoupon = async function (code) {
  const input = document.getElementById('coupon-code');
  if (input) input.value = code;
  closeModal('m-offers');
  await applyCoupon();
  couponListRequest = null;            // counts may have moved; refresh next open
};

/* ═══════════════════════════════════════
   STICKY RESERVE BAR
   Appears once the hero is scrolled past,
   hides again over the booking section so
   it never covers the form it points at.
═══════════════════════════════════════ */
function initStickyCta() {
  const bar  = document.getElementById('sticky-cta');
  const book = document.getElementById('book');
  if (!bar || !book) return;
  const toggle = () => {
    const pastHero = window.scrollY > window.innerHeight * 0.85;
    const r        = book.getBoundingClientRect();
    const overBook = r.top < window.innerHeight && r.bottom > 0;
    bar.classList.toggle('on', pastHero && !overBook);
  };
  toggle();
  window.addEventListener('scroll', toggle, { passive: true });
  window.addEventListener('resize', toggle, { passive: true });
  bar.addEventListener('click', () => trackCustom('StickyReserveClick'));
}

/* ═══════════════════════════════════════
   MONTH NAVIGATION — swipe or click to page
   the calendar forward (up to MAX_CAL_MONTHS_AHEAD
   months) so guests can always book the next
   available Saturday without a manual date update.
═══════════════════════════════════════ */
window.calPrevMonth = function () {
  if (calMonthOffset <= 0) return;
  calMonthOffset--;
  buildCal();
};
window.calNextMonth = function () {
  if (calMonthOffset >= calMonths_().length - 1) return;
  calMonthOffset++;
  buildCal();
};

function initCalSwipe() {
  const el = document.getElementById('cal-comm');
  if (!el) return;
  let startX = 0, startY = 0, tracking = false;
  el.addEventListener('touchstart', (e) => {
    if (!e.touches || !e.touches.length) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const touch = e.changedTouches && e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) window.calNextMonth(); else window.calPrevMonth();
    }
  }, { passive: true });
}

function selectDate(dateKey, cell, remaining) {
  if (remaining < gCount) {
    showErr('cal-err', `Only ${remaining} seat(s) left. Reduce guest count or pick another date.`);
    return;
  }
  document.querySelectorAll('.day.sel').forEach(c => c.classList.remove('sel'));
  cell.classList.add('sel');
  selectedDate = dateKey;
  hideErr('cal-err');
  const nextBtn = document.getElementById('wiz-next-1');
  if (nextBtn) nextBtn.disabled = false;
  track('AddToCart', {
    value: currentAmount(), currency: 'INR',
    content_name: 'Community Dining', content_category: dateKey, num_items: gCount
  });
  updateOfferLine();
}

/* ═══════════════════════════════════════
   BOOKING WIZARD (Community Dining)
   2 steps: 1 Evening & Guests · 2 Details & Pay
═══════════════════════════════════════ */
function goToWizStep(n) {
  wizStep = n;
  document.querySelectorAll('.wiz-step').forEach(el => {
    el.classList.toggle('active', el.id === 'wiz-step-' + n);
  });
  document.querySelectorAll('.wiz-dot').forEach(dot => {
    const step = Number(dot.dataset.step);
    dot.classList.toggle('active', step === n);
    dot.classList.toggle('done', step < n);
  });
  if (n === 2) updatePriceDisplay();
  const progress = document.getElementById('wiz-progress');
  if (progress) progress.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

window.wizNext = function (current) {
  if (current === 1 && !selectedDate) {
    showErr('cal-err', 'Please select a date to continue.');
    return;
  }
  if (current === 1) {
    loadRazorpay().catch(() => {});   // warm the checkout script in the background
    track('InitiateCheckout', {
      value: currentAmount(), currency: 'INR',
      content_name: 'Community Dining', content_category: selectedDate, num_items: gCount
    });
  }
  goToWizStep(current + 1);
};

window.wizBack = function (current) {
  goToWizStep(current - 1);
};

/* ═══════════════════════════════════════
   ERROR HELPERS
═══════════════════════════════════════ */
function showErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent   = msg;
  el.style.display = 'block';
}
function hideErr(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

/* ═══════════════════════════════════════
   FIELD VALUE HELPERS
═══════════════════════════════════════ */
function val(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  return el.value ? el.value.trim() : '';
}
function getRadio(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : '';
}
// Escapes text before it's interpolated into innerHTML, so a guest typing
// something like <img onerror=...> into a name field can't inject markup.
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

/* ═══════════════════════════════════════
   RENDER GUEST FORMS
═══════════════════════════════════════ */
function renderForms() {
  const wrap = document.getElementById('member-forms');
  if (!wrap) return;
  wrap.innerHTML = '';

  for (let i = 1; i <= gCount; i++) {
    const div = document.createElement('div');
    div.className = 'mbl';
    div.innerHTML = `
      <div class="mbl-title">Guest ${i}${i > 1 ? ' <span class="mbl-hint">\u00B7 name and diet only</span>' : ''}</div>
      <div class="fgrid">

        <div class="ff">
          <label>Full Name *</label>
          <input type="text" id="guest_name_${i}" placeholder="Full name" autocomplete="off">
          <p id="err_name_${i}" class="ferr"></p>
        </div>

        <div class="ff">
          <label>WhatsApp Number ${i === 1 ? '*' : '<span class="opt">(optional)</span>'}</label>
          <input type="tel" id="guest_wa_${i}" placeholder="10-digit number" maxlength="10" autocomplete="off">
          <p id="err_wa_${i}" class="ferr"></p>
        </div>

        <div class="ff">
          <label>Dietary Preference *</label>
          <select id="guest_diet_${i}">
            <option value="">Select</option>
            <option value="Egg OK">Ok with Egg</option>
            <option value="No Egg">Prefer Eggless</option>
          </select>
          <p id="err_diet_${i}" class="ferr"></p>
        </div>

        ${i === 1 ? `
        <div class="ff">
          <label>Social Media Platform *</label>
          <div class="radio-group" id="radio_group_${i}">
            <label class="radio-option">
              <input type="radio" name="guest_platform_${i}" value="Instagram"> Instagram
            </label>
            <label class="radio-option">
              <input type="radio" name="guest_platform_${i}" value="Twitter"> Twitter
            </label>
            <label class="radio-option">
              <input type="radio" name="guest_platform_${i}" value="LinkedIn"> LinkedIn
            </label>
          </div>
          <p id="err_platform_${i}" class="ferr"></p>
        </div>

        <div class="ff span2">
          <label>Social Handle *</label>
          <input type="text" id="guest_username_${i}" placeholder="@yourhandle" autocomplete="off">
          <p id="err_username_${i}" class="ferr"></p>
        </div>
        ` : ''}

        ${i === 1 ? `
        <div class="ff span2">
          <label>How did you hear about us? *</label>
          <select id="guest_source">
            <option value="">Select one</option>
            <option value="Instagram">Instagram</option>
            <option value="Twitter / X">Twitter / X</option>
            <option value="Friend / Previous Guest">Friend / Previous Guest</option>
          </select>
          <p id="err_source" class="ferr"></p>
        </div>` : ''}

      </div>`;
    wrap.appendChild(div);

    document.getElementById(`guest_name_${i}`).addEventListener('blur', function() {
      this.value.trim() ? hideErr(`err_name_${i}`) : showErr(`err_name_${i}`, 'Name is required');
    });
    document.getElementById(`guest_wa_${i}`).addEventListener('blur', function() {
      const v = this.value.trim();
      if (i > 1 && !v) { hideErr(`err_wa_${i}`); return; }   // optional for guest 2+
      /^\d{10}$/.test(v)
        ? hideErr(`err_wa_${i}`)
        : showErr(`err_wa_${i}`, 'Enter a valid 10-digit WhatsApp number');
    });
    document.getElementById(`guest_wa_${i}`).addEventListener('input', function() {
      this.value = this.value.replace(/\D/g, '');
    });
    document.getElementById(`guest_diet_${i}`).addEventListener('change', function() {
      this.value ? hideErr(`err_diet_${i}`) : showErr(`err_diet_${i}`, 'Please select a dietary preference');
    });
    if (i === 1) {
      document.getElementById(`guest_username_${i}`).addEventListener('blur', function() {
        this.value.trim() ? hideErr(`err_username_${i}`) : showErr(`err_username_${i}`, 'Social handle is required');
      });
      document.querySelectorAll(`input[name="guest_platform_${i}"]`).forEach(r => {
        r.addEventListener('change', () => hideErr(`err_platform_${i}`));
      });
      document.getElementById('guest_source').addEventListener('change', function() {
        this.value ? hideErr('err_source') : showErr('err_source', 'Please tell us how you heard about us');
      });
    }
  }
}

/* ═══════════════════════════════════════
   GUEST COUNTER
═══════════════════════════════════════ */
window.changeG = function (delta) {
  const next = gCount + delta;
  if (next > 4) {
    const el = document.getElementById('g-err');
    if (el) el.style.display = 'block';
    return;
  }
  if (next < 1) return;
  gCount = next;
  recheckCouponForGuests_();
  document.getElementById('gc-n').textContent = gCount;
  document.getElementById('gc-').disabled      = gCount === 1;
  document.getElementById('gc+').disabled      = gCount === 4;
  // At the 4-guest cap, keep the WhatsApp note visible (not just on a
  // blocked attempt to go past it) so guests always see why + is disabled.
  if (gCount === 4) {
    const gErrEl = document.getElementById('g-err');
    if (gErrEl) gErrEl.style.display = 'block';
  } else {
    hideErr('g-err');
  }
  updatePriceDisplay();
  if (selectedDate) {
    const remaining = seatsLeft_(selectedDate);
    if (remaining < gCount) {
      showErr('cal-err', `Only ${remaining} seat(s) left for this date.`);
      gCount = remaining;
      document.getElementById('gc-n').textContent = gCount;
      document.getElementById('gc-').disabled = gCount === 1;
      document.getElementById('gc+').disabled = true;
      updatePriceDisplay();
    }
  }
  renderForms();
};

/* ═══════════════════════════════════════
   PRICE / COUPON
═══════════════════════════════════════ */
function currentAmount() {
  const base = PRICE * gCount;
  return appliedCoupon ? Math.round(base * (1 - appliedCoupon.discountPercent / 100)) : base;
}

function updatePriceDisplay() {
  const base  = PRICE * gCount;
  const final = currentAmount();

  const gcTot = document.getElementById('gc-tot');
  if (gcTot) gcTot.textContent = '₹' + final.toLocaleString('en-IN');

  const amtEl = document.getElementById('c-amt');
  if (amtEl) {
    amtEl.innerHTML = appliedCoupon
      ? `<span class="p-amt-orig">₹${base.toLocaleString('en-IN')}</span><sup>₹</sup>${final.toLocaleString('en-IN')}`
      : `<sup>₹</sup>${final.toLocaleString('en-IN')}`;
  }

  const subEl = document.getElementById('c-sub');
  if (subEl) {
    subEl.textContent = appliedCoupon
      ? `for ${gCount} guest${gCount > 1 ? 's' : ''} · ${appliedCoupon.discountPercent}% off applied`
      : `for ${gCount} guest${gCount > 1 ? 's' : ''} · all-inclusive`;
  }

  updatePayButton();
}

function updatePayButton() {
  const btn = document.getElementById('comm-submit');
  if (!btn || btn.disabled) return;
  btn.textContent = `Pay ₹${currentAmount().toLocaleString('en-IN')} & Reserve`;
}

// Checks a coupon code against the backend (Community Dining only). The
// backend is the source of truth for the discount -- this just previews it
// and remembers the code so submitCommunity() can send it along.
window.applyCoupon = async function () {
  const codeInput = document.getElementById('coupon-code');
  const msg       = document.getElementById('coupon-msg');
  const code      = codeInput ? codeInput.value.trim() : '';

  if (!code) {
    appliedCoupon = null;
    if (msg) msg.style.display = 'none';
    updatePriceDisplay();
    return;
  }

  // Instant path: a code from the offers list is checked against the list the
  // page already has -- no round trip to Google. The backend still re-checks
  // everything (usage cap, one per customer) when payment starts.
  const known = (couponListCache || []).find(c => c.code === code.toUpperCase());
  if (known) {
    if (known.available && known.remaining !== null && known.remaining < gCount) {
      appliedCoupon = null;
      const r = known.remaining;
      if (msg) { msg.textContent = `Only ${r} seat${r > 1 ? 's' : ''} left on "${known.code}" \u2014 reduce to ${r} guest${r > 1 ? 's' : ''} to use it.`; msg.className = 'coupon-msg err'; msg.style.display = 'block'; }
    } else if (known.available) {
      appliedCoupon = { code: known.code, discountPercent: known.discountPercent };
      if (msg) { msg.textContent = `"${known.code}" applied \u2014 ${known.discountPercent}% off.`; msg.className = 'coupon-msg ok'; msg.style.display = 'block'; }
      confirmCouponInBackground_();
    } else {
      appliedCoupon = null;
      if (msg) { msg.textContent = `Sorry, "${known.code}" has already been claimed by its first ${known.maxUses} guests.`; msg.className = 'coupon-msg err'; msg.style.display = 'block'; }
    }
    updatePriceDisplay();
    return;
  }

  const btn = document.getElementById('coupon-apply-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }

  try {
    const data = await backendJSON_({ action: 'validateCoupon', code: code, guestCount: gCount, whatsapp: val('guest_wa_1') });

    if (data.valid) {
      appliedCoupon = { code: data.code, discountPercent: data.discountPercent };
      if (msg) {
        msg.textContent = `"${data.code}" applied — ${data.discountPercent}% off.`;
        msg.className   = 'coupon-msg ok';
        msg.style.display = 'block';
      }
    } else {
      appliedCoupon = null;
      if (msg) {
        msg.textContent = data.error || 'That coupon code is not valid.';
        msg.className   = 'coupon-msg err';
        msg.style.display = 'block';
      }
    }
  } catch (err) {
    appliedCoupon = null;
    if (msg) {
      msg.textContent = 'Could not check that code — please try again.';
      msg.className   = 'coupon-msg err';
      msg.style.display = 'block';
    }
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Apply'; }
  updatePriceDisplay();
};

/* ═══════════════════════════════════════
   TAB SWITCHER — Community Dining / Gift a Seat
═══════════════════════════════════════ */
window.switchTab = function (name) {
  const isGift = name === 'gift';
  const tabCommunity = document.getElementById('tab-community');
  const tabGift       = document.getElementById('tab-gift');
  const panelCommunity = document.getElementById('panel-community');
  const panelGift       = document.getElementById('panel-gift');

  if (tabCommunity) {
    tabCommunity.classList.toggle('on', !isGift);
    tabCommunity.setAttribute('aria-selected', String(!isGift));
  }
  if (tabGift) {
    tabGift.classList.toggle('on', isGift);
    tabGift.setAttribute('aria-selected', String(isGift));
  }
  if (panelCommunity) panelCommunity.classList.toggle('on', !isGift);
  if (panelGift)       panelGift.classList.toggle('on', isGift);
};

/* ═══════════════════════════════════════
   VALIDATE COMMUNITY
═══════════════════════════════════════ */
function validateGuestDetails() {
  let ok = true;
  for (let i = 1; i <= gCount; i++) {
    const name     = val(`guest_name_${i}`);
    const wa       = val(`guest_wa_${i}`);
    const diet     = val(`guest_diet_${i}`);
    const platform = getRadio(`guest_platform_${i}`);
    const handle   = val(`guest_username_${i}`);
    if (!name)                { showErr(`err_name_${i}`,     'Name is required'); ok = false; }
    if (i === 1 && !/^\d{10}$/.test(wa)) { showErr(`err_wa_${i}`, 'Enter a valid 10-digit WhatsApp number'); ok = false; }
    if (i > 1 && wa && !/^\d{10}$/.test(wa)) { showErr(`err_wa_${i}`, 'Enter a valid 10-digit number, or leave it blank'); ok = false; }
    if (!diet)                { showErr(`err_diet_${i}`,     'Please select a dietary preference'); ok = false; }
    // Social platform + handle are asked of the booker only. Every extra
    // mandatory field on guest 2 was costing date-night bookings; the
    // handle is easier to get in the WhatsApp confirmation anyway.
    if (i === 1) {
      if (!platform)          { showErr(`err_platform_${i}`, 'Please select a social media platform'); ok = false; }
      if (!handle)            { showErr(`err_username_${i}`, 'Social handle is required'); ok = false; }
    }
  }
  const src = val('guest_source');
  if (!src) { showErr('err_source', 'Please tell us how you heard about us'); ok = false; }
  return ok;
}

function validateCommunity() {
  let ok = true;
  if (!selectedDate) {
    showErr('cal-err', 'Please select a date to continue.');
    ok = false;
  }
  if (!validateGuestDetails()) ok = false;
  return ok;
}

/* ═══════════════════════════════════════
   SUBMIT — COMMUNITY (Razorpay checkout)
═══════════════════════════════════════ */
window.submitCommunity = async function () {
  if (!validateCommunity()) return;
  hideErr('pay-err');

  const btn = document.getElementById('comm-submit');
  btn.disabled    = true;
  btn.textContent = 'Opening secure payment…';

  const source = val('guest_source');
  const guests = [];
  for (let i = 1; i <= gCount; i++) {
    guests.push({
      name    : val(`guest_name_${i}`),
      whatsapp: val(`guest_wa_${i}`),
      diet    : val(`guest_diet_${i}`),
      platform: getRadio(`guest_platform_${i}`),
      handle  : val(`guest_username_${i}`),
      source  : i === 1 ? source : ''
    });
  }
  const couponCode = appliedCoupon ? appliedCoupon.code : '';

  function restoreButton() {
    btn.disabled = false;
    updatePayButton();
  }

  try {
    await loadRazorpay();
    const order = await backendJSON_({
        action     : 'createOrder',
        checkoutId : Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        bookingDate: selectedDate,
        guestCount : gCount,
        couponCode : couponCode,
        whatsapp   : guests[0].whatsapp,
        attribution: getAttribution()
      });
    if (order.error) throw Object.assign(new Error(order.error), { fromServer: true });

    const rzp = new Razorpay({
      key        : order.keyId,
      amount     : order.amount,
      currency   : order.currency,
      name       : 'Not Just Dinner',
      description: `Community Dining · ${gCount} guest${gCount > 1 ? 's' : ''} · ${selectedDate}`,
      order_id   : order.orderId,
      prefill    : {
        name   : guests[0].name,
        contact: guests[0].whatsapp ? '+91' + guests[0].whatsapp : ''
      },
      theme  : { color: '#2E1208' },
      modal  : { ondismiss: function () {
        // Closed without paying: give the coupon seats back straight away
        // instead of holding them until the reservation times out.
        if (order.couponCode) {
          backendJSON_({ action: 'releaseCheckout', orderId: order.orderId, couponCode: order.couponCode }, 3).catch(() => {});
        }
        restoreButton();
      } },
      handler: async function (response) {
        try {
          const result = await backendJSON_({
              action              : 'verifyBooking',
              razorpay_order_id   : response.razorpay_order_id,
              razorpay_payment_id : response.razorpay_payment_id,
              razorpay_signature  : response.razorpay_signature,
              bookingDate         : selectedDate,
              guests              : guests,
              couponCode          : couponCode,
              attribution         : getAttribution()
            }, 4);
          if (result.verified) {
            // Fire before the reset below wipes selectedDate/gCount.
            track('Purchase', {
              value: currentAmount(), currency: 'INR',
              content_name: 'Community Dining', content_category: selectedDate,
              content_type: 'product', num_items: gCount
            });
            availability[selectedDate] = (availability[selectedDate] || 0) + gCount;
            if (couponCode) { couponListRequest = null; fetchCouponList_(); }   // seats left changed
            buildCal();
            const icon  = document.getElementById('mc-icon');
            const title = document.getElementById('mc-title');
            const body  = document.getElementById('mc-body');
            if (icon)  icon.textContent  = '🕯';
            if (title) title.textContent = 'Seats Confirmed';
            if (body)  body.innerHTML    = 'Thank you for joining <strong style="font-weight:400">Not Just Dinner</strong>. We\'ll send the exact location and all details to your WhatsApp shortly.';
            openModal('m-community');
            resetCommunityForm();
          } else {
            showErr('pay-err', `We couldn't verify your payment. If you were charged, message us on WhatsApp with payment ID ${response.razorpay_payment_id} and we'll sort it out.`);
            restoreButton();
          }
        } catch (err) {
          console.error('[NJD] payment confirmation failed:', err);
          showErr('pay-err', 'Something went wrong confirming your payment. If you were charged, please message us on WhatsApp.');
          restoreButton();
        }
      }
    });
    rzp.on('payment.failed', function (resp) {
      showErr('pay-err', 'Payment failed: ' + (resp.error?.description || 'please try again.'));
      restoreButton();
    });
    rzp.open();
  } catch (err) {
    // Backend reasons (coupon claimed, date closed, seats gone) are written for guests.
    showErr('pay-err', err && err.fromServer ? err.message : 'Could not start payment. Please try again.');
    restoreButton();
  }
};

/* ═══════════════════════════════════════
   RESET COMMUNITY FORM
═══════════════════════════════════════ */
function resetCommunityForm() {
  selectedDate = null;
  document.querySelectorAll('.day.sel').forEach(c => c.classList.remove('sel'));
  gCount = 1;
  appliedCoupon = null;
  const couponInput = document.getElementById('coupon-code');
  if (couponInput) couponInput.value = '';
  const couponMsg = document.getElementById('coupon-msg');
  if (couponMsg) couponMsg.style.display = 'none';
  document.getElementById('gc-n').textContent  = '1';
  document.getElementById('gc-').disabled       = true;
  document.getElementById('gc+').disabled       = false;
  hideErr('g-err');
  document.getElementById('comm-submit').disabled = false;
  const nextBtn = document.getElementById('wiz-next-1');
  if (nextBtn) nextBtn.disabled = true;
  updatePriceDisplay();
  renderForms();
  applyCalDefaults();
  buildCal();
  goToWizStep(1);
}

/* ═══════════════════════════════════════
   GIFT A SEAT — flexible, no fixed date.
   Recipient's actual evening is arranged
   over WhatsApp after purchase (valid 3
   months). Same Razorpay checkout flow as
   Community Dining, separate backend action.
═══════════════════════════════════════ */
let ggCount = 1;

window.changeGiftSeats = function (delta) {
  loadRazorpay().catch(() => {});
  const next = ggCount + delta;
  if (next > 4) {
    const el = document.getElementById('gg-err');
    if (el) el.style.display = 'block';
    return;
  }
  if (next < 1) return;
  ggCount = next;
  document.getElementById('gg-n').textContent = ggCount;
  document.getElementById('gg-').disabled      = ggCount === 1;
  document.getElementById('gg+').disabled      = ggCount === 4;
  hideErr('gg-err');
  const total = PRICE * ggCount;
  document.getElementById('gg-tot').textContent = '₹' + total.toLocaleString('en-IN');
  document.getElementById('g-amt').innerHTML    = `<sup>₹</sup>${total.toLocaleString('en-IN')}`;
  document.getElementById('g-sub').textContent  = `for ${ggCount} seat${ggCount > 1 ? 's' : ''} · all-inclusive`;
  updateGiftPayButton();
};

function updateGiftPayButton() {
  const btn = document.getElementById('gift-submit');
  if (!btn || btn.disabled) return;
  const total = PRICE * ggCount;
  btn.textContent = `Pay ₹${total.toLocaleString('en-IN')} & Gift`;
}

function initGiftForm() {
  const bindBlur = (id, errId, check, msg) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('blur', function () {
      check(this.value.trim()) ? hideErr(errId) : showErr(errId, msg);
    });
  };
  bindBlur('g-rec-name',    'err-g-rec-name',    v => !!v,               "Recipient's name is required");
  bindBlur('g-gifter-name', 'err-g-gifter-name', v => !!v,               'Your name is required');
  bindBlur('g-gifter-wa',   'err-g-gifter-wa',   v => /^\d{10}$/.test(v), 'Enter a valid 10-digit WhatsApp number');
  const wa = document.getElementById('g-gifter-wa');
  if (wa) wa.addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); });
  const src = document.getElementById('g-source');
  if (src) src.addEventListener('change', function () {
    this.value ? hideErr('err-g-source') : showErr('err-g-source', 'Please tell us how you heard about us');
  });
}

function validateGift() {
  let ok = true;
  const recName    = val('g-rec-name');
  const gifterName = val('g-gifter-name');
  const gifterWa   = val('g-gifter-wa');
  const source     = val('g-source');
  if (!recName)                  { showErr('err-g-rec-name',    "Recipient's name is required"); ok = false; }
  if (!gifterName)                { showErr('err-g-gifter-name', 'Your name is required'); ok = false; }
  if (!/^\d{10}$/.test(gifterWa)) { showErr('err-g-gifter-wa',   'Enter a valid 10-digit WhatsApp number'); ok = false; }
  if (!source)                    { showErr('err-g-source',      'Please tell us how you heard about us'); ok = false; }
  return ok;
}

window.submitGift = async function () {
  if (!validateGift()) return;
  hideErr('gift-pay-err');

  const btn = document.getElementById('gift-submit');
  btn.disabled    = true;
  btn.textContent = 'Opening secure payment…';

  const recipientName     = val('g-rec-name');
  const recipientWhatsapp = val('g-rec-wa');
  const gifterName        = val('g-gifter-name');
  const gifterWhatsapp    = val('g-gifter-wa');
  const occasion           = val('g-occasion');
  const note               = val('g-note');
  const delivery           = val('g-delivery');
  const source             = val('g-source');

  function restoreButton() {
    btn.disabled = false;
    updateGiftPayButton();
  }

  try {
    await loadRazorpay();
    const order = await backendJSON_({
        action     : 'createOrder',
        checkoutId : Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        bookingDate: '',
        guestCount : ggCount,
        attribution: getAttribution()
      });
    if (order.error) throw new Error(order.error);

    const rzp = new Razorpay({
      key        : order.keyId,
      amount     : order.amount,
      currency   : order.currency,
      name       : 'Not Just Dinner',
      description: `Gift · ${ggCount} seat${ggCount > 1 ? 's' : ''} · for ${recipientName}`,
      order_id   : order.orderId,
      prefill    : {
        name   : gifterName,
        contact: gifterWhatsapp ? '+91' + gifterWhatsapp : ''
      },
      theme  : { color: '#2E1208' },
      modal  : { ondismiss: restoreButton },
      handler: async function (response) {
        try {
          const result = await backendJSON_({
              action               : 'verifyGift',
              razorpay_order_id    : response.razorpay_order_id,
              razorpay_payment_id  : response.razorpay_payment_id,
              razorpay_signature   : response.razorpay_signature,
              seats                : ggCount,
              recipientName        : recipientName,
              recipientWhatsapp    : recipientWhatsapp,
              gifterName            : gifterName,
              gifterWhatsapp        : gifterWhatsapp,
              occasion              : occasion,
              note                  : note,
              delivery              : delivery,
              source                : source,
              attribution           : getAttribution()
            }, 4);
          if (result.verified) {
            track('Purchase', {
              value: PRICE * ggCount, currency: 'INR',
              content_name: 'Gift a Seat', content_type: 'product', num_items: ggCount
            });
            const icon  = document.getElementById('mc-icon');
            const title = document.getElementById('mc-title');
            const body  = document.getElementById('mc-body');
            if (icon)  icon.textContent  = '🎁';
            if (title) title.textContent = 'Gift Sent!';
            if (body)  body.innerHTML    = `The seat${ggCount > 1 ? 's are' : ' is'} reserved for <strong style="font-weight:400">${escapeHtml(recipientName)}</strong>, valid for 3 months on any upcoming Saturday. We'll be in touch on WhatsApp shortly to arrange the evening.`;
            openModal('m-community');
            resetGiftForm();
          } else {
            showErr('gift-pay-err', `We couldn't verify your payment. If you were charged, message us on WhatsApp with payment ID ${response.razorpay_payment_id} and we'll sort it out.`);
            restoreButton();
          }
        } catch (err) {
          showErr('gift-pay-err', 'Something went wrong confirming your payment. If you were charged, please message us on WhatsApp.');
          restoreButton();
        }
      }
    });
    rzp.on('payment.failed', function (resp) {
      showErr('gift-pay-err', 'Payment failed: ' + (resp.error?.description || 'please try again.'));
      restoreButton();
    });
    rzp.open();
  } catch (err) {
    showErr('gift-pay-err', 'Could not start payment. Please try again.');
    restoreButton();
  }
};

function resetGiftForm() {
  ggCount = 1;
  hideErr('gg-err');
  document.getElementById('gg-n').textContent  = '1';
  document.getElementById('gg-').disabled       = true;
  document.getElementById('gg+').disabled       = false;
  document.getElementById('gg-tot').textContent = '₹' + PRICE.toLocaleString('en-IN');
  document.getElementById('g-amt').innerHTML    = '<sup>₹</sup>' + PRICE.toLocaleString('en-IN');
  document.getElementById('g-sub').textContent  = 'for 1 seat · all-inclusive';
  document.getElementById('gift-submit').disabled = false;
  ['g-rec-name', 'g-rec-wa', 'g-gifter-name', 'g-gifter-wa', 'g-occasion', 'g-note'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['g-delivery', 'g-source'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });
  ['err-g-rec-name', 'err-g-gifter-name', 'err-g-gifter-wa', 'err-g-source'].forEach(hideErr);
  updateGiftPayButton();
}

/* ═══════════════════════════════════════
   LIGHTBOX
═══════════════════════════════════════ */
let lbImages = [];
let lbIndex  = 0;

function initLightbox() {
  const items = document.querySelectorAll('.gi img');
  lbImages = Array.from(items).map(img => img.src);
  items.forEach((img, i) => {
    img.parentElement.addEventListener('click', () => openLightbox(i));
  });
  document.addEventListener('keydown', e => {
    const lb = document.getElementById('lightbox');
    if (!lb || !lb.classList.contains('open')) return;
    if (e.key === 'Escape')     closeLightbox();
    if (e.key === 'ArrowLeft')  lbNav(-1);
    if (e.key === 'ArrowRight') lbNav(1);
  });
}

window.openLightbox = function (i) {
  lbIndex = i;
  document.getElementById('lb-img').src = lbImages[i];
  document.getElementById('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
};
window.closeLightbox = function () {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = 'auto';
};
window.lbNav = function (dir, e) {
  if (e) e.stopPropagation();
  lbIndex = (lbIndex + dir + lbImages.length) % lbImages.length;
  const img = document.getElementById('lb-img');
  img.style.opacity = '0';
  setTimeout(() => {
    img.src = lbImages[lbIndex];
    img.style.opacity = '1';
  }, 120);
};

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
function initPage() {
  initScrollReveal();
  initNavScroll();
  renderForms();
  applyCalDefaults();    // pre-pick the next open Saturday straight away
  buildCal();            // real month + bookable dates on screen immediately
  fetchAvailability();   // cache paint, then the live counts
  // Coupons arrive with the seat counts; only ask separately if they didn't.
  availabilityRequest.then(() => {
    // Always show the price the backend will actually charge.
    if (backendPrice && backendPrice !== PRICE) {
      PRICE = backendPrice;
      updatePriceDisplay();
      updateGiftPayButton();
      updateOfferLine();
    }
    if (prefetchedCoupons) couponListCache = prefetchedCoupons;
    else fetchCouponList_();
  });
  initLightbox();
  updatePriceDisplay();
  initGiftForm();
  updateGiftPayButton();
  initCalSwipe();
  initStickyCta();
  updateOfferLine();
}

// Deferred scripts run after parsing, so the DOM is ready immediately.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage);
} else {
  initPage();
}

/* ═══════════════════════════════════════
   SCROLL REVEAL — fades/slides sections in
   as they enter the viewport, with a light
   stagger for grid children (gallery cards,
   menu course rows, etc.)
═══════════════════════════════════════ */
function initScrollReveal() {
  const targets = document.querySelectorAll('.rev, .cr');
  if (!('IntersectionObserver' in window)) {
    targets.forEach(el => el.classList.add('vis'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el    = entry.target;
      const group = el.closest('.gal, .for-grid, .hosts-grid, .courses');
      if (group && group !== el) {
        const idx = Array.from(group.children).indexOf(el);
        setTimeout(() => el.classList.add('vis'), Math.max(idx, 0) * 80);
      } else {
        el.classList.add('vis');
      }
      io.unobserve(el);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  targets.forEach(el => io.observe(el));
}

/* ═══════════════════════════════════════
   NAV — subtle shadow once page scrolls
═══════════════════════════════════════ */
function initNavScroll() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const toggle = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  toggle();
  window.addEventListener('scroll', toggle, { passive: true });
}

/* ═══════════════════════════════════════
   TESTIMONIAL SLIDER
═══════════════════════════════════════ */
let currentSlide = 0;
let sliderTimer  = null;

window.goToSlide = function (n) {
  const slides = document.querySelectorAll('.tslide');
  const dots   = document.querySelectorAll('.tdot');
  const total  = slides.length;
  if (!total) return;
  if (n < 0) n = total - 1;
  if (n >= total) n = 0;
  slides[currentSlide]?.classList.remove('active');
  dots[currentSlide]?.classList.remove('active');
  currentSlide = n;
  slides[currentSlide].classList.add('active');
  dots[currentSlide].classList.add('active');
  resetSliderTimer();
};

window.prevSlide = function () {
  goToSlide(currentSlide - 1);
};

window.nextSlide = function () {
  goToSlide(currentSlide + 1);
};

function resetSliderTimer() {
  clearInterval(sliderTimer);
  sliderTimer = setInterval(() => {
    const total = document.querySelectorAll('.tslide').length;
    if (!total) return;
    goToSlide((currentSlide + 1) % total);
  }, 5000);
}

resetSliderTimer();
