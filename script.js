'use strict';

/* ═══════════════════════════════════════
   CONFIG
═══════════════════════════════════════ */
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyCeVslM1jAHj-aLjyhHyElGIyfRvJjpJT0HV1wRNRLyogMmPPZwnfXEthFpMwoYUTryA/exec';
const MAX_SEATS = 8;
const PRICE = 1999;

const SAT = [4, 11, 18, 25];
const SUN = [5, 12, 19, 26];

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let selectedDate = null;
let availability = {};
let gCount = 1;

/* ═══════════════════════════════════════
   RENDER FORMS
   — Name, WhatsApp, Dietary, Dinner Date,
     Social Platform, Social Username per guest
   — Source only from guest 1
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
          <input type="text" id="gn${i}" placeholder="Full name" required>
        </div>

        <div class="ff">
          <label>WhatsApp Number *</label>
          <input type="tel" id="gwa${i}" placeholder="10-digit number" required>
        </div>

        <div class="ff">
          <label>Dietary Preference *</label>
          <select id="gdiet${i}" required>
            <option value="">Select</option>
            <option value="Egg OK">Egg OK</option>
            <option value="No Egg">No Egg</option>
          </select>
        </div>

        <div class="ff">
          <label>Preferred Dinner Date *</label>
          <select id="gddate${i}" required>
            <option value="">Select a date</option>
            <option value="2026-04-04">Saturday, 4 April</option>
            <option value="2026-04-05">Sunday, 5 April</option>
            <option value="2026-04-11">Saturday, 11 April</option>
            <option value="2026-04-12">Sunday, 12 April</option>
            <option value="2026-04-18">Saturday, 18 April</option>
            <option value="2026-04-19">Sunday, 19 April</option>
            <option value="2026-04-25">Saturday, 25 April</option>
            <option value="2026-04-26">Sunday, 26 April</option>
          </select>
        </div>

        <div class="ff">
          <label>Social Platform</label>
          <select id="gplatform${i}">
            <option value="">Select</option>
            <option value="Instagram">Instagram</option>
            <option value="Twitter / X">Twitter / X</option>
            <option value="LinkedIn">LinkedIn</option>
          </select>
        </div>

        <div class="ff">
          <label>Social Username</label>
          <input type="text" id="gusername${i}" placeholder="@handle">
        </div>

        ${i === 1 ? `
        <div class="ff span2">
          <label>How did you hear about us? *</label>
          <select id="gsrc" required>
            <option value="">Select one</option>
            <option value="Instagram">Instagram</option>
            <option value="Twitter / X">Twitter / X</option>
            <option value="Friend / Previous Guest">Friend / Previous Guest</option>
          </select>
        </div>
        ` : ''}
      </div>
    `;

    wrap.appendChild(div);
  }

  // Sync the calendar-selected date into all guest date dropdowns
  if (selectedDate) {
    for (let i = 1; i <= gCount; i++) {
      const sel = document.getElementById('gddate' + i);
      if (sel) sel.value = selectedDate;
    }
  }
}

/* ═══════════════════════════════════════
   TAB SWITCHING
═══════════════════════════════════════ */
window.switchTab = function (tab) {
  ['community', 'private', 'gift'].forEach(id => {
    document.getElementById('tab-' + id).classList.toggle('on', id === tab);
    document.getElementById('panel-' + id).classList.toggle('on', id === tab);
  });

  if (tab === 'community') {
    setTimeout(() => renderForms(), 100);
  }
};

/* ═══════════════════════════════════════
   FETCH AVAILABILITY
═══════════════════════════════════════ */
function fetchAvailability() {
  fetch(SCRIPT_URL)
    .then(res => res.json())
    .then(data => {
      availability = data || {};
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

  // Remove all cells except the 7 day-label headers
  while (grid.children.length > 7) grid.removeChild(grid.lastChild);

  // April 2026 starts on Wednesday (index 3), so 3 empty cells first
  for (let i = 0; i < 3; i++) {
    const e = document.createElement('div');
    e.className = 'day empty';
    grid.appendChild(e);
  }

  for (let d = 1; d <= 30; d++) {
    const cell = document.createElement('div');
    const isSat = SAT.includes(d);
    const isSun = SUN.includes(d);
    const isAvail = isSat || isSun;

    cell.innerHTML = `<span class="day-num">${d}</span>`;

    if (isAvail) {
      const key = `2026-04-${String(d).padStart(2, '0')}`;
      const booked = availability[key] || 0;
      const remaining = MAX_SEATS - booked;

      if (remaining <= 0) {
        cell.className = 'day full';
        cell.innerHTML += `<span class="day-seats">Full</span>`;
      } else {
        cell.className = 'day avail';
        if (remaining <= 2) cell.classList.add('almost');
        cell.innerHTML += `<span class="day-seats">${remaining} left</span>`;
        cell.onclick = () => selectDate(key, cell, remaining);
      }
    } else {
      cell.className = 'day other';
    }

    grid.appendChild(cell);
  }

  // Hide the loading indicator once calendar is built
  const loading = document.getElementById('cal-loading');
  if (loading) loading.style.display = 'none';
}

function selectDate(dateKey, cell, remaining) {
  if (remaining < gCount) {
    alert(`Only ${remaining} seat${remaining === 1 ? '' : 's'} left on this date. Please reduce your guest count.`);
    return;
  }

  document.querySelectorAll('.day.sel').forEach(c => c.classList.remove('sel'));
  cell.classList.add('sel');
  selectedDate = dateKey;

  document.getElementById('cal-err').style.display = 'none';

  // Sync chosen date into all guest date dropdowns
  for (let i = 1; i <= gCount; i++) {
    const sel = document.getElementById('gddate' + i);
    if (sel) sel.value = selectedDate;
  }
}

/* ═══════════════════════════════════════
   GUEST COUNTER
═══════════════════════════════════════ */
window.changeG = function (delta) {
  const next = gCount + delta;
  if (next < 1 || next > 4) return;

  document.getElementById('g-err').style.display = 'none';
  gCount = next;

  document.getElementById('gc-n').textContent = gCount;
  document.getElementById('gc-').disabled = gCount === 1;
  document.getElementById('gc+').disabled = gCount === 4;

  const total = PRICE * gCount;
  document.getElementById('gc-tot').textContent = '₹' + total.toLocaleString('en-IN');
  document.getElementById('c-amt').innerHTML = `<sup>₹</sup>${total.toLocaleString('en-IN')}`;
  document.getElementById('c-sub').textContent = `for ${gCount} guest${gCount > 1 ? 's' : ''}`;

  // Check if selected date still has enough seats
  if (selectedDate) {
    const booked = availability[selectedDate] || 0;
    const remaining = MAX_SEATS - booked;
    if (remaining < gCount) {
      document.getElementById('cal-err').style.display = 'block';
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
  const text = document.getElementById('upiText').textContent;
  navigator.clipboard.writeText(text).catch(() => {});
  const msg = document.getElementById('copyMsg');
  msg.style.opacity = 1;
  setTimeout(() => (msg.style.opacity = 0), 1500);
};

/* ═══════════════════════════════════════
   MODAL HELPERS
═══════════════════════════════════════ */
window.openModal = function (id) {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
};

window.closeModal = function (id) {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = 'none';
    document.body.style.overflow = 'auto';
  }
};

/* ═══════════════════════════════════════
   VALIDATE GUEST FORMS
═══════════════════════════════════════ */
function validateForms() {
  for (let i = 1; i <= gCount; i++) {
    const name = document.getElementById('gn' + i)?.value.trim();
    const wa   = document.getElementById('gwa' + i)?.value.trim();
    const diet = document.getElementById('gdiet' + i)?.value;
    const date = document.getElementById('gddate' + i)?.value;

    if (!name) { alert(`Please enter the name for Guest ${i}.`); return false; }
    if (!wa || wa.length < 10) { alert(`Please enter a valid WhatsApp number for Guest ${i}.`); return false; }
    if (!diet) { alert(`Please select a dietary preference for Guest ${i}.`); return false; }
    if (!date) { alert(`Please select a dinner date for Guest ${i}.`); return false; }
  }

  const src = document.getElementById('gsrc')?.value;
  if (!src) { alert('Please tell us how you heard about us.'); return false; }

  return true;
}

/* ═══════════════════════════════════════
   SUBMIT BOOKING
═══════════════════════════════════════ */
window.submitCommunity = function () {
  // Step 1 — date check
  if (!selectedDate) {
    document.getElementById('cal-err').style.display = 'block';
    document.getElementById('cal-err').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // Step 2 — form validation
  if (!validateForms()) return;

  // Step 3 — disable button to prevent double-submit
  const btn = document.getElementById('comm-submit');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  // Step 4 — build FormData with all guests
  const formData = new FormData();
  formData.append('booking_type', 'Community Dining');
  formData.append('dinner_date', selectedDate);
  formData.append('guest_count', gCount);
  formData.append('source', document.getElementById('gsrc')?.value || '');

  for (let i = 1; i <= gCount; i++) {
    formData.append(`g${i}_name`,     document.getElementById('gn' + i)?.value.trim() || '');
    formData.append(`g${i}_whatsapp`, document.getElementById('gwa' + i)?.value.trim() || '');
    formData.append(`g${i}_diet`,     document.getElementById('gdiet' + i)?.value || '');
    formData.append(`g${i}_date`,     document.getElementById('gddate' + i)?.value || '');
    formData.append(`g${i}_platform`, document.getElementById('gplatform' + i)?.value || '');
    formData.append(`g${i}_username`, document.getElementById('gusername' + i)?.value.trim() || '');
  }

  // Step 5 — fire and forget (no-cors, Google Apps Script)
  fetch(SCRIPT_URL, { method: 'POST', body: formData, mode: 'no-cors' })
    .finally(() => {
      // Update local availability optimistically
      availability[selectedDate] = (availability[selectedDate] || 0) + gCount;
      buildCal();

      // Show the success modal
      openModal('m-community');

      // Reset the button
      btn.disabled = false;
      btn.textContent = "I've Paid — Confirm My Seat(s)";
    });
};

/* ═══════════════════════════════════════
   GIFT PRICE
═══════════════════════════════════════ */
window.updateGiftPrice = function (seats) {
  const price = PRICE * seats;
  document.getElementById('g-amt').innerHTML = `<sup>₹</sup>${price.toLocaleString('en-IN')}`;
  document.getElementById('g-sub').textContent = `for ${seats} seat${seats > 1 ? 's' : ''}`;
  document.getElementById('vp-seats').textContent = `${seats} guest${seats > 1 ? 's' : ''}`;
  document.getElementById('vp-val').textContent = `₹${price.toLocaleString('en-IN')}`;
};

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
window.onload = function () {
  // Reveal animations
  document.querySelectorAll('.rev').forEach(el => el.classList.add('vis'));
  document.querySelectorAll('.cr').forEach((el, i) => {
    setTimeout(() => el.classList.add('vis'), i * 100);
  });

  // Render guest forms on load
  renderForms();

  // Load live availability and build calendar
  fetchAvailability();
};
