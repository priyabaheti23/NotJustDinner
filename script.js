'use strict';

/* ═══════════════════════════════════════
   CONFIG
═══════════════════════════════════════ */
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx-6k9hrMJc9YkOKSS1wy-1JH5xOT9cvJyQ8N3sFDdiv_QL3MkMJw2C_O5n7Sx-EWAHwQ/exec';
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
   URL-encoded so e.parameter works in Apps Script
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
  el.textContent  = msg;
  el.style.display = 'block';
}
function hideErr(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

/* ═══════════════════════════════════════
   GET FIELD VALUE SAFELY
═══════════════════════════════════════ */
function val(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  return el.value ? el.value.trim() : '';
}

/* ═══════════════════════════════════════
   RENDER GUEST FORMS
   IDs used here MUST match exactly what
   submitCommunity() reads below
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
            <option value="Egg OK">Egg OK</option>
            <option value="No Egg">No Egg</option>
          </select>
          <p id="err_diet_${i}" class="ferr"></p>
        </div>

        <div class="ff">
          <label>Social Platform</label>
          <select id="guest_platform_${i}">
            <option value="">Select (optional)</option>
            <option value="Instagram">Instagram</option>
            <option value="Twitter / X">Twitter / X</option>
            <option value="LinkedIn">LinkedIn</option>
          </select>
        </div>

        <div class="ff span2">
          <label>Social Username</label>
          <input type="text" id="guest_username_${i}" placeholder="@handle (optional)" autocomplete="off">
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

    /* ── Inline validation (fires on blur) ── */
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
      // Strip non-digits as they type
      this.value = this.value.replace(/\D/g, '');
    });

    document.getElementById(`guest_diet_${i}`).addEventListener('change', function() {
      this.value
        ? hideErr(`err_diet_${i}`)
        : showErr(`err_diet_${i}`, 'Please select a dietary preference');
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
   COPY UPI
═══════════════════════════════════════ */
window.copyUPI = function () {
  const text = document.getElementById('upiText')?.textContent || 'baheti.priya@yescred';
  navigator.clipboard.writeText(text).catch(() => {});
  const msg = document.getElementById('copyMsg');
  if (msg) { msg.style.opacity = 1; setTimeout(() => msg.style.opacity = 0, 1500); }
};

/* ═══════════════════════════════════════
   VALIDATE COMMUNITY FORM
   Returns true if all good, false + shows
   errors if anything is missing
═══════════════════════════════════════ */
function validateCommunity() {
  let ok = true;

  if (!selectedDate) {
    showErr('cal-err', 'Please select a date to continue.');
    document.getElementById('cal-err').scrollIntoView({ behavior: 'smooth', block: 'center' });
    ok = false;
  }

  for (let i = 1; i <= gCount; i++) {
    const name = val(`guest_name_${i}`);
    const wa   = val(`guest_wa_${i}`);
    const diet = val(`guest_diet_${i}`);

    if (!name) { showErr(`err_name_${i}`, 'Name is required'); ok = false; }
    if (!/^\d{10}$/.test(wa)) { showErr(`err_wa_${i}`, 'Enter a valid 10-digit WhatsApp number'); ok = false; }
    if (!diet) { showErr(`err_diet_${i}`, 'Please select a dietary preference'); ok = false; }
  }

  const src = val('guest_source');
  if (!src) { showErr('err_source', 'Please tell us how you heard about us'); ok = false; }

  return ok;
}

/* ═══════════════════════════════════════
   SUBMIT — COMMUNITY
═══════════════════════════════════════ */
window.submitCommunity = function () {
  if (!validateCommunity()) return;

  const btn = document.getElementById('comm-submit');
  btn.disabled    = true;
  btn.textContent = 'Submitting…';

  /* Build payload — field IDs match renderForms() exactly */
const payload = {
  "Timestamp": new Date().toLocaleString("en-IN"),
  "Booking Type": "Community Dining",
  "Date": selectedDate,
  "Guest Count": gCount,
  "Name": val("guest_name_1"),
  "WhatsApp": val("guest_wa_1"),
  "Diet": val("guest_diet_1"),
  "Source": val("guest_source")
};

  for (let i = 1; i <= gCount; i++) {
    payload[`g${i}_name`]     = val(`guest_name_${i}`);
    payload[`g${i}_whatsapp`] = val(`guest_wa_${i}`);
    payload[`g${i}_diet`]     = val(`guest_diet_${i}`);
    payload[`g${i}_platform`] = val(`guest_platform_${i}`);
    payload[`g${i}_username`] = val(`guest_username_${i}`);
  }

  /* Debug — remove after confirming data arrives */
  console.log('Submitting payload:', payload);

  postToSheet(payload).finally(() => {
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
  // Reset date selection
  selectedDate = null;
  document.querySelectorAll('.day.sel').forEach(c => c.classList.remove('sel'));

  // Reset guest count to 1
  gCount = 1;
  document.getElementById('gc-n').textContent  = '1';
  document.getElementById('gc-').disabled       = true;
  document.getElementById('gc+').disabled       = false;
  document.getElementById('gc-tot').textContent = '₹1,999';
  document.getElementById('c-amt').innerHTML    = '<sup>₹</sup>1,999';
  document.getElementById('c-sub').textContent  = 'for 1 guest · all-inclusive';

  // Re-render blank forms
  renderForms();
}

/* ═══════════════════════════════════════
   PRIVATE DINING FORM
═══════════════════════════════════════ */
function initPrivateForm() {
  const form = document.getElementById('privateForm');
  if (!form) return;

  /* Inline validation */
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

  /* Add error elements below each field */
  addErrEl('pd-name',  'err-pd-name');
  addErrEl('pd-phone', 'err-pd-phone');
  addErrEl('pd-src',   'err-pd-src');

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    let ok    = true;
    const name  = document.getElementById('pd-name')?.value.trim()  || '';
    const phone = document.getElementById('pd-phone')?.value.trim() || '';
    const src   = document.getElementById('pd-src')?.value          || '';

    if (!name)                        { showErr('err-pd-name',  'Name is required'); ok = false; }
    if (!/^\d{10}$/.test(phone))      { showErr('err-pd-phone', 'Enter a valid 10-digit number'); ok = false; }
    if (!src)                         { showErr('err-pd-src',   'Please tell us how you heard about us'); ok = false; }
    if (!ok) return;

    const btn = document.getElementById('pd-submit');
    btn.disabled    = true;
    btn.textContent = 'Submitting…';

    const payload = {
      booking_type   : 'Private Dining',
      timestamp      : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      name,
      whatsapp       : phone,
      guest_count    : document.getElementById('pd-guests')?.value || '',
      preferred_date : document.getElementById('pd-date')?.value   || '',
      dietary_notes  : document.getElementById('pd-diet')?.value   || '',
      occasion       : document.getElementById('pd-occ')?.value    || '',
      source         : src,
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
    const recName   = document.getElementById('g-rec')?.value.trim()        || '';
    const gifter    = document.getElementById('g-gifter')?.value.trim()     || '';
    const gifterWa  = document.getElementById('g-gifter-wa')?.value.trim()  || '';
    const src       = document.getElementById('g-src')?.value               || '';

    if (!recName)                         { showErr('err-g-rec',       "Recipient's name is required"); ok = false; }
    if (!gifter)                          { showErr('err-g-gifter',    'Your name is required');        ok = false; }
    if (!/^\d{10}$/.test(gifterWa))       { showErr('err-g-gifter-wa','Enter a valid 10-digit number'); ok = false; }
    if (!src)                             { showErr('err-g-src',       'Please tell us how you heard about us'); ok = false; }
    if (!ok) return;

    const btn = document.getElementById('gf-submit');
    btn.disabled    = true;
    btn.textContent = 'Submitting…';

    const seats = document.getElementById('g-seats')?.value || '1';
    const payload = {
      booking_type       : 'Gift Voucher',
      timestamp          : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      recipient_name     : recName,
      recipient_whatsapp : document.getElementById('g-rec-wa')?.value.trim()  || '',
      gifter_name        : gifter,
      gifter_whatsapp    : gifterWa,
      gift_seats         : seats,
      gift_value         : PRICE * Number(seats),
      occasion           : document.getElementById('g-occ')?.value            || '',
      personal_note      : document.getElementById('g-note')?.value           || '',
      voucher_delivery   : document.getElementById('g-delivery')?.value       || '',
      source             : src,
    };

    console.log('Gift payload:', payload);

    postToSheet(payload).finally(() => {
      openModal('m-gift');
      form.reset();
      // Reset voucher preview
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
   HELPER — insert <p> error element
   after an input if not already there
═══════════════════════════════════════ */
function addErrEl(inputId, errorId) {
  if (document.getElementById(errorId)) return;
  const input = document.getElementById(inputId);
  if (!input) return;
  const p = document.createElement('p');
  p.id            = errorId;
  p.className     = 'ferr';
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
