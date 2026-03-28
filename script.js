'use strict';

/* ═══════════════════════════════════════
   CONFIG  — single Apps Script URL for ALL bookings
═══════════════════════════════════════ */
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyCeVslM1jAHj-aLjyhHyElGIyfRvJjpJT0HV1wRNRLyogMmPPZwnfXEthFpMwoYUTryA/exec';
const MAX_SEATS  = 8;
const PRICE      = 1999;
const SAT        = [4, 11, 18, 25];
const SUN        = [5, 12, 19, 26];

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let selectedDate = null;
let availability = {};
let gCount       = 1;

/* ═══════════════════════════════════════
   UTILITY — send JSON to Apps Script
   (URLSearchParams → application/x-www-form-urlencoded
    which doPost(e) can read via e.parameter)
═══════════════════════════════════════ */
function postToSheet(payload) {
  // Convert plain object → URL-encoded string so Apps Script e.parameter works
  const body = Object.entries(payload)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v ?? ''))
    .join('&');

  return fetch(SCRIPT_URL, {
    method : 'POST',
    mode   : 'no-cors',          // required for Apps Script
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
}

/* ═══════════════════════════════════════
   MODAL HELPERS
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
   TAB SWITCHING
═══════════════════════════════════════ */
window.switchTab = function (tab) {
  ['community', 'private', 'gift'].forEach(id => {
    document.getElementById('tab-'   + id).classList.toggle('on', id === tab);
    document.getElementById('panel-' + id).classList.toggle('on', id === tab);
  });
  if (tab === 'community') renderForms();
};

/* ═══════════════════════════════════════
   FETCH AVAILABILITY
═══════════════════════════════════════ */
function fetchAvailability() {
  fetch(SCRIPT_URL)
    .then(r => r.json())
    .then(data => { availability = data || {}; buildCal(); })
    .catch(() => buildCal());
}

/* ═══════════════════════════════════════
   CALENDAR
═══════════════════════════════════════ */
function buildCal() {
  const grid = document.getElementById('cal-comm');
  if (!grid) return;
  while (grid.children.length > 7) grid.removeChild(grid.lastChild);

  // April 2026 starts on Wednesday → 3 blank cells (Sun Mon Tue)
  for (let i = 0; i < 3; i++) {
    const e = document.createElement('div');
    e.className = 'day empty';
    grid.appendChild(e);
  }

  for (let d = 1; d <= 30; d++) {
    const cell    = document.createElement('div');
    const isAvail = SAT.includes(d) || SUN.includes(d);
    cell.innerHTML = `<span class="day-num">${d}</span>`;

    if (isAvail) {
      const key       = `2026-04-${String(d).padStart(2, '0')}`;
      const booked    = availability[key] || 0;
      const remaining = MAX_SEATS - booked;

      if (remaining <= 0) {
        cell.className = 'day full';
        cell.innerHTML += `<span class="day-seats">Full</span>`;
      } else {
        cell.className = 'day avail' + (remaining <= 2 ? ' almost' : '');
        cell.innerHTML += `<span class="day-seats">${remaining} left</span>`;
        cell.onclick   = () => selectDate(key, cell, remaining);
      }
    } else {
      cell.className = 'day other';
    }
    grid.appendChild(cell);
  }

  const loading = document.getElementById('cal-loading');
  if (loading) loading.style.display = 'none';
}

function selectDate(dateKey, cell, remaining) {
  if (remaining < gCount) {
    showFieldError('cal-err', `Only ${remaining} seat(s) left on this date. Reduce guest count or pick another date.`);
    return;
  }
  document.querySelectorAll('.day.sel').forEach(c => c.classList.remove('sel'));
  cell.classList.add('sel');
  selectedDate = dateKey;
  hideFieldError('cal-err');
}

/* ═══════════════════════════════════════
   INLINE VALIDATION HELPERS
═══════════════════════════════════════ */
function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}
function hideFieldError(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// Attach live validation to an input/select
function attachValidation(inputId, errorId, validator) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const check = () => {
    const err = validator(el.value);
    err ? showFieldError(errorId, err) : hideFieldError(errorId);
  };
  el.addEventListener('input',  check);
  el.addEventListener('blur',   check);
  el.addEventListener('change', check);
}

/* ═══════════════════════════════════════
   RENDER GUEST FORMS
   — Name, WhatsApp, Dietary, Social Platform,
     Social Username per guest
   — Source (how did you hear) from guest 1 only
   — Date is taken from calendar, NOT per-guest
═══════════════════════════════════════ */
function renderForms() {
  const wrap = document.getElementById('member-forms');
  if (!wrap) return;
  wrap.innerHTML = '';

  for (let i = 1; i <= gCount; i++) {
    const div = document.createElement('div');
    div.className = 'mbl';
    div.innerHTML = `
      <div class="mbl-title">Guest ${i}</div>
      <div class="fgrid">

        <div class="ff">
          <label for="gn${i}">Full Name *</label>
          <input type="text" id="gn${i}" placeholder="Full name" autocomplete="name">
          <p class="field-err" id="err-gn${i}" style="display:none;color:var(--red);font-size:11px;margin-top:4px;font-style:italic"></p>
        </div>

        <div class="ff">
          <label for="gwa${i}">WhatsApp Number *</label>
          <input type="tel" id="gwa${i}" placeholder="10-digit number" maxlength="10">
          <p class="field-err" id="err-gwa${i}" style="display:none;color:var(--red);font-size:11px;margin-top:4px;font-style:italic"></p>
        </div>

        <div class="ff">
          <label for="gdiet${i}">Dietary Preference *</label>
          <select id="gdiet${i}">
            <option value="">Select</option>
            <option value="Egg OK">Egg OK</option>
            <option value="No Egg">No Egg</option>
          </select>
          <p class="field-err" id="err-gdiet${i}" style="display:none;color:var(--red);font-size:11px;margin-top:4px;font-style:italic"></p>
        </div>

        <div class="ff">
          <label for="gplatform${i}">Social Platform</label>
          <select id="gplatform${i}">
            <option value="">Select (optional)</option>
            <option value="Instagram">Instagram</option>
            <option value="Twitter / X">Twitter / X</option>
            <option value="LinkedIn">LinkedIn</option>
          </select>
        </div>

        <div class="ff span2">
          <label for="gusername${i}">Social Username</label>
          <input type="text" id="gusername${i}" placeholder="@handle (optional)">
        </div>

        ${i === 1 ? `
        <div class="ff span2">
          <label for="gsrc">How did you hear about us? *</label>
          <select id="gsrc">
            <option value="">Select one</option>
            <option value="Instagram">Instagram</option>
            <option value="Twitter / X">Twitter / X</option>
            <option value="Friend / Previous Guest">Friend / Previous Guest</option>
          </select>
          <p class="field-err" id="err-gsrc" style="display:none;color:var(--red);font-size:11px;margin-top:4px;font-style:italic"></p>
        </div>` : ''}

      </div>`;
    wrap.appendChild(div);

    // Attach live validation after the element exists in the DOM
    attachValidation(`gn${i}`,    `err-gn${i}`,    v => v.trim() ? '' : 'Name is required');
    attachValidation(`gwa${i}`,   `err-gwa${i}`,   v => /^\d{10}$/.test(v.trim()) ? '' : 'Enter a valid 10-digit WhatsApp number');
    attachValidation(`gdiet${i}`, `err-gdiet${i}`, v => v ? '' : 'Please select a dietary preference');
    if (i === 1) {
      attachValidation('gsrc', 'err-gsrc', v => v ? '' : 'Please tell us how you heard about us');
    }
  }
}

/* ═══════════════════════════════════════
   GUEST COUNTER
═══════════════════════════════════════ */
window.changeG = function (delta) {
  const next = gCount + delta;
  if (next < 1 || next > 4) return;

  gCount = next;
  document.getElementById('gc-n').textContent   = gCount;
  document.getElementById('gc-').disabled        = gCount === 1;
  document.getElementById('gc+').disabled        = gCount === 4;
  document.getElementById('g-err').style.display = 'none';

  const total = PRICE * gCount;
  document.getElementById('gc-tot').textContent   = '₹' + total.toLocaleString('en-IN');
  document.getElementById('c-amt').innerHTML      = `<sup>₹</sup>${total.toLocaleString('en-IN')}`;
  document.getElementById('c-sub').textContent    = `for ${gCount} guest${gCount > 1 ? 's' : ''} · all-inclusive`;

  // If selected date no longer has enough seats, deselect it
  if (selectedDate) {
    const remaining = MAX_SEATS - (availability[selectedDate] || 0);
    if (remaining < gCount) {
      showFieldError('cal-err', `Only ${remaining} seat(s) left on this date. Pick another date.`);
      selectedDate = null;
      document.querySelectorAll('.day.sel').forEach(c => c.classList.remove('sel'));
    }
  }

  renderForms();
};

/* ═══════════════════════════════════════
   COPY UPI
═══════════════════════════════════════ */
window.copyUPI = function () {
  const text = document.getElementById('upiText')?.textContent || 'baheti.priya@yescred';
  navigator.clipboard.writeText(text).catch(() => {});
  const msg = document.getElementById('copyMsg');
  if (msg) { msg.style.opacity = 1; setTimeout(() => msg.style.opacity = 0, 1500); }
};

/* ═══════════════════════════════════════
   VALIDATE ALL GUEST FORMS (on submit)
═══════════════════════════════════════ */
function validateCommunityForms() {
  let valid = true;

  if (!selectedDate) {
    showFieldError('cal-err', 'Please select a date to continue.');
    document.getElementById('cal-err').scrollIntoView({ behavior: 'smooth', block: 'center' });
    valid = false;
  }

  for (let i = 1; i <= gCount; i++) {
    const name = document.getElementById('gn'    + i)?.value.trim();
    const wa   = document.getElementById('gwa'   + i)?.value.trim();
    const diet = document.getElementById('gdiet' + i)?.value;

    if (!name) { showFieldError(`err-gn${i}`,    'Name is required'); valid = false; }
    if (!/^\d{10}$/.test(wa)) { showFieldError(`err-gwa${i}`, 'Enter a valid 10-digit WhatsApp number'); valid = false; }
    if (!diet) { showFieldError(`err-gdiet${i}`, 'Please select a dietary preference'); valid = false; }
  }

  const src = document.getElementById('gsrc')?.value;
  if (!src) { showFieldError('err-gsrc', 'Please tell us how you heard about us'); valid = false; }

  return valid;
}

/* ═══════════════════════════════════════
   SUBMIT — COMMUNITY DINING
═══════════════════════════════════════ */
window.submitCommunity = function () {
  if (!validateCommunityForms()) return;

  const btn = document.getElementById('comm-submit');
  btn.disabled    = true;
  btn.textContent = 'Submitting…';

  // Build flat payload — all data in one object
  const payload = {
    booking_type : 'Community Dining',
    dinner_date  : selectedDate,
    guest_count  : gCount,
    source       : document.getElementById('gsrc')?.value || '',
    timestamp    : new Date().toISOString(),
  };

  for (let i = 1; i <= gCount; i++) {
    payload[`g${i}_name`]     = document.getElementById('gn'        + i)?.value.trim() || '';
    payload[`g${i}_whatsapp`] = document.getElementById('gwa'       + i)?.value.trim() || '';
    payload[`g${i}_diet`]     = document.getElementById('gdiet'     + i)?.value        || '';
    payload[`g${i}_platform`] = document.getElementById('gplatform' + i)?.value        || '';
    payload[`g${i}_username`] = document.getElementById('gusername' + i)?.value.trim() || '';
  }

  postToSheet(payload)
    .finally(() => {
      // Optimistically update local availability
      availability[selectedDate] = (availability[selectedDate] || 0) + gCount;
      buildCal();

      openModal('m-community');

      btn.disabled    = false;
      btn.textContent = "I've Paid — Confirm My Seat(s)";
    });
};

/* ═══════════════════════════════════════
   SUBMIT — PRIVATE DINING
   (intercepts the native form submit)
═══════════════════════════════════════ */
function initPrivateForm() {
  const form = document.getElementById('privateForm');
  if (!form) return;

  // Attach inline validation
  attachValidation('pd-name',  'err-pd-name',  v => v.trim() ? '' : 'Name is required');
  attachValidation('pd-phone', 'err-pd-phone', v => /^\d{10}$/.test(v.trim()) ? '' : 'Enter a valid 10-digit number');
  attachValidation('pd-src',   'err-pd-src',   v => v ? '' : 'Please tell us how you heard about us');

  // Add error placeholders if they don't exist
  addErrorEl('pd-name',  'err-pd-name');
  addErrorEl('pd-phone', 'err-pd-phone');
  addErrorEl('pd-src',   'err-pd-src');

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    let valid = true;
    const name  = document.getElementById('pd-name')?.value.trim();
    const phone = document.getElementById('pd-phone')?.value.trim();
    const src   = document.getElementById('pd-src')?.value;

    if (!name)  { showFieldError('err-pd-name',  'Name is required'); valid = false; }
    if (!/^\d{10}$/.test(phone)) { showFieldError('err-pd-phone', 'Enter a valid 10-digit number'); valid = false; }
    if (!src)   { showFieldError('err-pd-src',   'Please tell us how you heard about us'); valid = false; }
    if (!valid) return;

    const btn = document.getElementById('pd-submit');
    btn.disabled    = true;
    btn.textContent = 'Submitting…';

    const payload = {
      booking_type   : 'Private Dining',
      name           : name,
      whatsapp       : phone,
      guest_count    : document.getElementById('pd-guests')?.value  || '',
      preferred_date : document.getElementById('pd-date')?.value    || '',
      dietary_notes  : document.getElementById('pd-diet')?.value    || '',
      occasion       : document.getElementById('pd-occ')?.value     || '',
      source         : src,
      timestamp      : new Date().toISOString(),
    };

    postToSheet(payload)
      .finally(() => {
        openModal('m-private');
        btn.disabled    = false;
        btn.textContent = "I've Paid — Request Private Dining";
        form.reset();
      });
  });
}

/* ═══════════════════════════════════════
   SUBMIT — GIFT VOUCHER
═══════════════════════════════════════ */
function initGiftForm() {
  const form = document.getElementById('giftForm');
  if (!form) return;

  attachValidation('g-rec',       'err-g-rec',       v => v.trim() ? '' : "Recipient's name is required");
  attachValidation('g-gifter',    'err-g-gifter',    v => v.trim() ? '' : 'Your name is required');
  attachValidation('g-gifter-wa', 'err-g-gifter-wa', v => /^\d{10}$/.test(v.trim()) ? '' : 'Enter a valid 10-digit number');
  attachValidation('g-src',       'err-g-src',       v => v ? '' : 'Please tell us how you heard about us');

  addErrorEl('g-rec',       'err-g-rec');
  addErrorEl('g-gifter',    'err-g-gifter');
  addErrorEl('g-gifter-wa', 'err-g-gifter-wa');
  addErrorEl('g-src',       'err-g-src');

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    let valid = true;
    const recName  = document.getElementById('g-rec')?.value.trim();
    const gifter   = document.getElementById('g-gifter')?.value.trim();
    const gifterWa = document.getElementById('g-gifter-wa')?.value.trim();
    const src      = document.getElementById('g-src')?.value;

    if (!recName)  { showFieldError('err-g-rec',       "Recipient's name is required"); valid = false; }
    if (!gifter)   { showFieldError('err-g-gifter',    'Your name is required');        valid = false; }
    if (!/^\d{10}$/.test(gifterWa)) { showFieldError('err-g-gifter-wa', 'Enter a valid 10-digit number'); valid = false; }
    if (!src)      { showFieldError('err-g-src',       'Please tell us how you heard about us'); valid = false; }
    if (!valid) return;

    const btn = document.getElementById('gf-submit');
    btn.disabled    = true;
    btn.textContent = 'Submitting…';

    const seats = document.getElementById('g-seats')?.value || 1;
    const payload = {
      booking_type       : 'Gift Voucher',
      recipient_name     : recName,
      recipient_whatsapp : document.getElementById('g-rec-wa')?.value.trim()  || '',
      gifter_name        : gifter,
      gifter_whatsapp    : gifterWa,
      gift_seats         : seats,
      gift_value         : PRICE * Number(seats),
      occasion           : document.getElementById('g-occ')?.value             || '',
      personal_note      : document.getElementById('g-note')?.value            || '',
      voucher_delivery   : document.getElementById('g-delivery')?.value        || '',
      source             : src,
      timestamp          : new Date().toISOString(),
    };

    postToSheet(payload)
      .finally(() => {
        openModal('m-gift');
        btn.disabled    = false;
        btn.textContent = "I've Paid — Send the Voucher";
        form.reset();
        // Reset voucher preview
        document.getElementById('vp-for').textContent   = '—';
        document.getElementById('vp-from').textContent  = '—';
        document.getElementById('vp-seats').textContent = '1 guest';
        document.getElementById('vp-val').textContent   = '₹1,999';
      });
  });
}

/* Helper — insert error <p> after an input if not already there */
function addErrorEl(inputId, errorId) {
  if (document.getElementById(errorId)) return;
  const input = document.getElementById(inputId);
  if (!input) return;
  const p = document.createElement('p');
  p.id        = errorId;
  p.className = 'field-err';
  p.style.cssText = 'display:none;color:var(--red);font-size:11px;margin-top:4px;font-style:italic';
  input.parentNode.insertBefore(p, input.nextSibling);
}

/* ═══════════════════════════════════════
   GIFT PRICE UPDATER
═══════════════════════════════════════ */
window.updateGiftPrice = function (seats) {
  const price = PRICE * Number(seats);
  document.getElementById('g-amt').innerHTML      = `<sup>₹</sup>${price.toLocaleString('en-IN')}`;
  document.getElementById('g-sub').textContent    = `for ${seats} seat${seats > 1 ? 's' : ''} · all-inclusive`;
  document.getElementById('vp-seats').textContent = `${seats} guest${seats > 1 ? 's' : ''}`;
  document.getElementById('vp-val').textContent   = `₹${price.toLocaleString('en-IN')}`;
};

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
window.onload = function () {
  document.querySelectorAll('.rev').forEach(el => el.classList.add('vis'));
  document.querySelectorAll('.cr').forEach((el, i) => {
    setTimeout(() => el.classList.add('vis'), i * 100);
  });

  renderForms();
  fetchAvailability();
  initPrivateForm();
  initGiftForm();
};
