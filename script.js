'use strict';

/* ═══════════════════════════════════════
   CONFIG
═══════════════════════════════════════ */
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx0oc-UL4prXW5j_v5WDHVpzeqDPEE3iFtdlaq1EcLPYqrvSQI-WMMm9leWBclvFFBbbQ/exec';
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
   POST TO SHEET
═══════════════════════════════════════ */
function postToSheet(payload) {
  const body = Object.entries(payload)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v ?? ''))
    .join('&');

  return fetch(SCRIPT_URL, {
    method : 'POST',
    mode   : 'cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
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
   AVAILABILITY
═══════════════════════════════════════ */
function fetchAvailability() {
  fetch(SCRIPT_URL)
    .then(r => r.json())
    .then(data => {
      availability = {};
      Object.entries(data || {}).forEach(([key, value]) => {
        let dateKey = key;
        if (key.includes('GMT') || key.includes('Apr') || key.includes('2026')) {
          const d = new Date(key);
          if (!isNaN(d)) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            dateKey = `${y}-${m}-${day}`;
          }
        }
        availability[dateKey] = (availability[dateKey] || 0) + value;
      });
      buildCal();
    })
    .catch(() => buildCal());
}

/* ═══════════════════════════════════════
   CALENDAR
═══════════════════════════════════════ */
function buildCal() {
  const grid = document.getElementById('cal-comm');
  if (!grid) return;
  while (grid.children.length > 7) grid.removeChild(grid.lastChild);

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
    showErr('cal-err', `Only ${remaining} seat(s) left. Reduce guest count or pick another date.`);
    return;
  }
  document.querySelectorAll('.day.sel').forEach(c => c.classList.remove('sel'));
  cell.classList.add('sel');
  selectedDate = dateKey;
  hideErr('cal-err');
}

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
   GET FIELD VALUE SAFELY (inputs / selects)
═══════════════════════════════════════ */
function val(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  return el.value ? el.value.trim() : '';
}

/* ═══════════════════════════════════════
   GET RADIO VALUE — reads checked radio by name
═══════════════════════════════════════ */
function getRadio(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : '';
}

/* ═══════════════════════════════════════
   CHANGE 7 — RENDER GUEST FORMS
   Social media platform: mandatory radio
   Handle: mandatory text input
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
          <label>Full Name *</label>
          <input type="text" id="guest_name_${i}" placeholder="Full name" autocomplete="off">
          <p id="err_name_${i}" class="ferr"></p>
        </div>

        <div class="ff">
          <label>WhatsApp Number *</label>
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

    /* Inline blur validation */
    document.getElementById(`guest_name_${i}`).addEventListener('blur', function() {
      this.value.trim()
        ? hideErr(`err_name_${i}`)
        : showErr(`err_name_${i}`, 'Name is required');
    });

    document.getElementById(`guest_wa_${i}`).addEventListener('blur', function() {
      /^\d{10}$/.test(this.value.trim())
        ? hideErr(`err_wa_${i}`)
        : showErr(`err_wa_${i}`, 'Enter a valid 10-digit WhatsApp number');
    });

    document.getElementById(`guest_wa_${i}`).addEventListener('input', function() {
      this.value = this.value.replace(/\D/g, '');
    });

    document.getElementById(`guest_diet_${i}`).addEventListener('change', function() {
      this.value
        ? hideErr(`err_diet_${i}`)
        : showErr(`err_diet_${i}`, 'Please select a dietary preference');
    });

    document.getElementById(`guest_username_${i}`).addEventListener('blur', function() {
      this.value.trim()
        ? hideErr(`err_username_${i}`)
        : showErr(`err_username_${i}`, 'Social handle is required');
    });

    /* Radio group — clear error when any option is selected */
    document.querySelectorAll(`input[name="guest_platform_${i}"]`).forEach(radio => {
      radio.addEventListener('change', () => hideErr(`err_platform_${i}`));
    });

    if (i === 1) {
      document.getElementById('guest_source').addEventListener('change', function() {
        this.value
          ? hideErr('err_source')
          : showErr('err_source', 'Please tell us how you heard about us');
      });
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
  document.getElementById('gc-n').textContent  = gCount;
  document.getElementById('gc-').disabled       = gCount === 1;
  document.getElementById('gc+').disabled       = gCount === 4;
  hideErr('g-err');

  const total = PRICE * gCount;
  document.getElementById('gc-tot').textContent  = '₹' + total.toLocaleString('en-IN');
  document.getElementById('c-amt').innerHTML     = `<sup>₹</sup>${total.toLocaleString('en-IN')}`;
  document.getElementById('c-sub').textContent   = `for ${gCount} guest${gCount > 1 ? 's' : ''} · all-inclusive`;

  if (selectedDate) {
    const remaining = MAX_SEATS - (availability[selectedDate] || 0);
    if (remaining < gCount) {
      showErr('cal-err', `Only ${remaining} seat(s) left on this date. Pick another date.`);
      selectedDate = null;
      document.querySelectorAll('.day.sel').forEach(c => c.classList.remove('sel'));
    }
  }

  renderForms();
};

/* ═══════════════════════════════════════
   CHANGE 8 — COPY UPI (works for all panels)
   Replaces old copyUPI() that relied on a
   single fixed id="upiText"
═══════════════════════════════════════ */
window.copyUPIById = function (textId, toastId) {
  const textEl  = document.getElementById(textId);
  const toastEl = document.getElementById(toastId);
  if (!textEl) return;
  const text = textEl.textContent.trim();
  navigator.clipboard.writeText(text).catch(() => {
    /* fallback for older browsers / non-https */
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity  = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
  if (toastEl) {
    toastEl.style.opacity = '1';
    setTimeout(() => { toastEl.style.opacity = '0'; }, 1600);
  }
};

/* Keep old copyUPI as an alias for any lingering references */
window.copyUPI = function () {
  window.copyUPIById('upiText-comm', 'copyMsg-comm');
};

/* ═══════════════════════════════════════
   CHANGE 7 — VALIDATE COMMUNITY FORM
   Now validates social media platform (radio)
   AND social handle as mandatory
═══════════════════════════════════════ */
function validateCommunity() {
  let ok = true;

  if (!selectedDate) {
    showErr('cal-err', 'Please select a date to continue.');
    document.getElementById('cal-err').scrollIntoView({ behavior: 'smooth', block: 'center' });
    ok = false;
  }

  for (let i = 1; i <= gCount; i++) {
    const name     = val(`guest_name_${i}`);
    const wa       = val(`guest_wa_${i}`);
    const diet     = val(`guest_diet_${i}`);
    const platform = getRadio(`guest_platform_${i}`);
    const handle   = val(`guest_username_${i}`);

    if (!name)     { showErr(`err_name_${i}`,     'Name is required'); ok = false; }
    if (!/^\d{10}$/.test(wa)) { showErr(`err_wa_${i}`, 'Enter a valid 10-digit WhatsApp number'); ok = false; }
    if (!diet)     { showErr(`err_diet_${i}`,     'Please select a dietary preference'); ok = false; }
    if (!platform) { showErr(`err_platform_${i}`, 'Please select a social media platform'); ok = false; }
    if (!handle)   { showErr(`err_username_${i}`, 'Social handle is required'); ok = false; }
  }

  const src = val('guest_source');
  if (!src) { showErr('err_source', 'Please tell us how you heard about us'); ok = false; }

  return ok;
}

/* ═══════════════════════════════════════
   SUBMIT — COMMUNITY
   Social media platform & handle now included
   in payload sent to Google Sheet
═══════════════════════════════════════ */
window.submitCommunity = function () {
  if (!validateCommunity()) return;

  const btn = document.getElementById('comm-submit');
  btn.disabled    = true;
  btn.textContent = 'Submitting…';

  // Sheet writes ONE ROW PER GUEST:
  // Timestamp | Date | Total Guests in Booking | Guest # | Guest Name | WhatsApp | Diet | Social Platform | Social Username | Source
  const source = val('guest_source');
  const posts  = [];

  for (let i = 1; i <= gCount; i++) {
    posts.push(postToSheet({
      Booking_Type              : 'Community Dining',
      'Date'                    : selectedDate,
      'Total Guests in Booking' : String(gCount),
      'Guest #'                 : String(i),
      'Guest Name'              : val(`guest_name_${i}`),
      'WhatsApp'                : val(`guest_wa_${i}`),
      'Diet'                    : val(`guest_diet_${i}`),
      'Social Platform'         : getRadio(`guest_platform_${i}`),
      'Social Username'         : val(`guest_username_${i}`),
      'Source'                  : source
    }));
  }

  console.log('Community: sending', gCount, 'row(s) to sheet');

  Promise.allSettled(posts).finally(() => {
    availability[selectedDate] = (availability[selectedDate] || 0) + gCount;
    buildCal();
    openModal('m-community');
    resetCommunityForm();
    btn.disabled    = false;
    btn.textContent = "I've Paid — Confirm My Seat(s)";
  });
};

/* ═══════════════════════════════════════
   RESET COMMUNITY FORM
═══════════════════════════════════════ */
function resetCommunityForm() {
  selectedDate = null;
  document.querySelectorAll('.day.sel').forEach(c => c.classList.remove('sel'));

  gCount = 1;
  document.getElementById('gc-n').textContent  = '1';
  document.getElementById('gc-').disabled       = true;
  document.getElementById('gc+').disabled       = false;
  document.getElementById('gc-tot').textContent = '₹1,999';
  document.getElementById('c-amt').innerHTML    = '<sup>₹</sup>1,999';
  document.getElementById('c-sub').textContent  = 'for 1 guest · all-inclusive';

  renderForms();
}

/* ═══════════════════════════════════════
   PRIVATE DINING FORM
═══════════════════════════════════════ */
function initPrivateForm() {
  const form = document.getElementById('privateForm');
  if (!form) return;

  document.getElementById('pd-name')?.addEventListener('blur', function() {
    this.value.trim() ? hideErr('err-pd-name') : showErr('err-pd-name', 'Name is required');
  });
  document.getElementById('pd-phone')?.addEventListener('blur', function() {
    /^\d{10}$/.test(this.value.trim())
      ? hideErr('err-pd-phone')
      : showErr('err-pd-phone', 'Enter a valid 10-digit number');
  });
  document.getElementById('pd-phone')?.addEventListener('input', function() {
    this.value = this.value.replace(/\D/g, '');
  });
  document.getElementById('pd-src')?.addEventListener('change', function() {
    this.value ? hideErr('err-pd-src') : showErr('err-pd-src', 'Please tell us how you heard about us');
  });

  addErrEl('pd-name',  'err-pd-name');
  addErrEl('pd-phone', 'err-pd-phone');
  addErrEl('pd-src',   'err-pd-src');

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    let ok    = true;
    const name  = document.getElementById('pd-name')?.value.trim()  || '';
    const phone = document.getElementById('pd-phone')?.value.trim() || '';
    const src   = document.getElementById('pd-src')?.value          || '';

    if (!name)                   { showErr('err-pd-name',  'Name is required'); ok = false; }
    if (!/^\d{10}$/.test(phone)) { showErr('err-pd-phone', 'Enter a valid 10-digit number'); ok = false; }
    if (!src)                    { showErr('err-pd-src',   'Please tell us how you heard about us'); ok = false; }
    if (!ok) return;

    const btn = document.getElementById('pd-submit');
    btn.disabled    = true;
    btn.textContent = 'Submitting…';

    const payload = {
      Booking_Type      : 'Private Dining',
      'Preferred Date'  : document.getElementById('pd-date')?.value   || '',
      'Guest Count'     : document.getElementById('pd-guests')?.value || '',
      'Host Name'       : name,
      'WhatsApp'        : phone,
      'Dietary Notes'   : document.getElementById('pd-diet')?.value   || '',
      'Occasion'        : document.getElementById('pd-occ')?.value    || '',
      'Source'          : src
    };

    console.log('Private payload:', payload);

    postToSheet(payload).finally(() => {
      openModal('m-private');
      form.reset();
      btn.disabled    = false;
      btn.textContent = "I've Paid — Request Private Dining";
    });
  });
}

/* ═══════════════════════════════════════
   GIFT VOUCHER FORM
═══════════════════════════════════════ */
function initGiftForm() {
  const form = document.getElementById('giftForm');
  if (!form) return;

  document.getElementById('g-rec')?.addEventListener('blur', function() {
    this.value.trim() ? hideErr('err-g-rec') : showErr('err-g-rec', "Recipient's name is required");
  });
  document.getElementById('g-gifter')?.addEventListener('blur', function() {
    this.value.trim() ? hideErr('err-g-gifter') : showErr('err-g-gifter', 'Your name is required');
  });
  document.getElementById('g-gifter-wa')?.addEventListener('blur', function() {
    /^\d{10}$/.test(this.value.trim())
      ? hideErr('err-g-gifter-wa')
      : showErr('err-g-gifter-wa', 'Enter a valid 10-digit number');
  });
  document.getElementById('g-gifter-wa')?.addEventListener('input', function() {
    this.value = this.value.replace(/\D/g, '');
  });
  document.getElementById('g-src')?.addEventListener('change', function() {
    this.value ? hideErr('err-g-src') : showErr('err-g-src', 'Please tell us how you heard about us');
  });

  addErrEl('g-rec',       'err-g-rec');
  addErrEl('g-gifter',    'err-g-gifter');
  addErrEl('g-gifter-wa', 'err-g-gifter-wa');
  addErrEl('g-src',       'err-g-src');

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    let ok = true;
    const recName  = document.getElementById('g-rec')?.value.trim()       || '';
    const gifter   = document.getElementById('g-gifter')?.value.trim()    || '';
    const gifterWa = document.getElementById('g-gifter-wa')?.value.trim() || '';
    const src      = document.getElementById('g-src')?.value              || '';

    if (!recName)                   { showErr('err-g-rec',       "Recipient's name is required"); ok = false; }
    if (!gifter)                    { showErr('err-g-gifter',    'Your name is required'); ok = false; }
    if (!/^\d{10}$/.test(gifterWa)) { showErr('err-g-gifter-wa','Enter a valid 10-digit number'); ok = false; }
    if (!src)                       { showErr('err-g-src',       'Please tell us how you heard about us'); ok = false; }
    if (!ok) return;

    const btn = document.getElementById('gf-submit');
    btn.disabled    = true;
    btn.textContent = 'Submitting…';

    const seats = document.getElementById('g-seats')?.value || '1';
    const payload = {
      Booking_Type           : 'Gift Voucher',
      'Recipient Name'       : recName,
      'Recipient WhatsApp'   : document.getElementById('g-rec-wa')?.value.trim() || '',
      'Gifter Name'          : gifter,
      'Gifter WhatsApp'      : gifterWa,
      'Gift Seats'           : seats,
      'Gift Value'           : PRICE * Number(seats),
      'Occasion'             : document.getElementById('g-occ')?.value   || '',
      'Personal Note'        : document.getElementById('g-note')?.value  || '',
      'Voucher Delivery'     : document.getElementById('g-delivery')?.value || '',
      'Source'               : src
    };

    console.log('Gift payload:', payload);

    postToSheet(payload).finally(() => {
      openModal('m-gift');
      form.reset();
      document.getElementById('vp-for').textContent   = '—';
      document.getElementById('vp-from').textContent  = '—';
      document.getElementById('vp-seats').textContent = '1 guest';
      document.getElementById('vp-val').textContent   = '₹1,999';
      document.getElementById('g-amt').innerHTML      = '<sup>₹</sup>1,999';
      document.getElementById('g-sub').textContent    = 'for 1 seat · all-inclusive';
      btn.disabled    = false;
      btn.textContent = "I've Paid — Send the Voucher";
    });
  });
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
   HELPER — insert error element
═══════════════════════════════════════ */
function addErrEl(inputId, errorId) {
  if (document.getElementById(errorId)) return;
  const input = document.getElementById(inputId);
  if (!input) return;
  const p = document.createElement('p');
  p.id        = errorId;
  p.className = 'ferr';
  input.parentNode.insertBefore(p, input.nextSibling);
}

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

/* ═══════════════════════════════════════
   CHANGE 6 — FLATPICKR for Private Date
   Uses text input (not type=date) so the
   calendar icon and alignment are consistent
═══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {
  const dateInput = document.getElementById('pd-date');
  if (!dateInput) return;

  flatpickr(dateInput, {
    minDate      : new Date().fp_incr(2),
    maxDate      : new Date().fp_incr(90),
    dateFormat   : 'D, d M Y',        /* e.g. "Sat, 05 Apr 2026" */
    disableMobile: true,
    allowInput   : false,
    onReady      : function (_, __, fp) {
      /* ensure the calendar icon in CSS is always visible */
      fp.input.setAttribute('readonly', true);
    }
  });
});
