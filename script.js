'use strict';

/* ═══════════════════════════════════════
   CONFIG
═══════════════════════════════════════ */
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyCeVslM1jAHj-aLjyhHyElGIyfRvJjpJT0HV1wRNRLyogMmPPZwnfXEthFpMwoYUTryA/exec'; // ← replace
const MAX_SEATS = 8;
const PRICE = 1999;

const SAT = [4,11,18,25];
const SUN = [5,12,19,26];

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let selectedDate = null;
let availability = {};
let gCount = 1;

/* ═══════════════════════════════════════
   RENDER FORMS (FIXED)
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

      <div class="ff">
        <label>Full Name *</label>
        <input type="text" id="gn${i}" required>
      </div>

      <div class="ff">
        <label>Diet *</label>
        <select id="gw${i}" required>
          <option value="">Select</option>
          <option>Egg OK</option>
          <option>No Egg</option>
        </select>
      </div>

      ${i === 1 ? `
      <div class="ff">
        <label>WhatsApp *</label>
        <input type="tel" id="gwa1" required>
      </div>

      <div class="ff">
        <label>Source</label>
        <select id="gsrc">
          <option>Instagram</option>
          <option>Friend</option>
          <option>Other</option>
        </select>
      </div>
      ` : ''}
    `;

    wrap.appendChild(div);
  }
}

/* ═══════════════════════════════════════
   TAB SWITCHING
═══════════════════════════════════════ */
window.switchTab = function(tab) {
  ['community','private','gift'].forEach(id => {
    document.getElementById('tab-' + id).classList.toggle('on', id === tab);
    document.getElementById('panel-' + id).classList.toggle('on', id === tab);
  });

  // 🔥 Ensure forms show when tab is opened
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

  while (grid.children.length > 7) grid.removeChild(grid.lastChild);

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
      const dayName = isSat ? 'Saturday' : 'Sunday';
      const key = `${dayName}, ${d} April 2026`;

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
}

function selectDate(dateKey, cell, remaining) {
  if (remaining < gCount) {
    alert(`Only ${remaining} seats left`);
    return;
  }

  document.querySelectorAll('.day.sel').forEach(c => c.classList.remove('sel'));
  cell.classList.add('sel');
  selectedDate = dateKey;

  document.getElementById('cal-err').style.display = 'none';
}

/* ═══════════════════════════════════════
   GUEST COUNTER
═══════════════════════════════════════ */
window.changeG = function(delta) {
  let next = gCount + delta;

  if (next > 4) {
    document.getElementById('g-err').style.display = 'block';
    return;
  }

  if (next < 1) return;

  document.getElementById('g-err').style.display = 'none';
  gCount = next;

  document.getElementById('gc-n').textContent = gCount;
  document.getElementById('gc-').disabled = gCount === 1;
  document.getElementById('gc+').disabled = gCount === 4;

  const total = PRICE * gCount;

  document.getElementById('gc-tot').textContent = '₹' + total;
  document.getElementById('c-amt').innerHTML = `<sup>₹</sup>${total}`;
  document.getElementById('c-sub').textContent =
    `for ${gCount} guest${gCount > 1 ? 's' : ''}`;

  renderForms(); // 🔥 update forms
};

/* ═══════════════════════════════════════
   COPY UPI
═══════════════════════════════════════ */
window.copyUPI = function() {
  const text = document.getElementById("upiText").textContent;
  navigator.clipboard.writeText(text);

  const msg = document.getElementById("copyMsg");
  msg.style.opacity = 1;

  setTimeout(() => msg.style.opacity = 0, 1500);
};

/* ═══════════════════════════════════════
   SUBMIT BOOKING
═══════════════════════════════════════ */
window.submitCommunity = function() {
  if (!selectedDate) {
    document.getElementById('cal-err').style.display = 'block';
    return;
  }

  const formData = new FormData();

  formData.append("booking_type", "Community Dining");
  formData.append("dinner_date", selectedDate);
  formData.append("guest_count", gCount);

  formData.append("g1_name", document.getElementById("gn1")?.value || "");
  formData.append("g1_wa", document.getElementById("gwa1")?.value || "");
  formData.append("g1_diet", document.getElementById("gw1")?.value || "");
  formData.append("source", document.getElementById("gsrc")?.value || "");

  fetch(SCRIPT_URL, {
    method: "POST",
    body: formData,
    mode: "no-cors"
  });

  alert("Booking Confirmed 🎉");

  // update UI instantly
  availability[selectedDate] = (availability[selectedDate] || 0) + gCount;
  buildCal();
};

/* ═══════════════════════════════════════
   GIFT PRICE
═══════════════════════════════════════ */
window.updateGiftPrice = function(seats) {
  const price = PRICE * seats;

  document.getElementById("g-amt").innerHTML = `<sup>₹</sup>${price}`;
  document.getElementById("g-sub").textContent =
    `for ${seats} seat${seats > 1 ? 's' : ''}`;

  document.getElementById("vp-seats").textContent =
    `${seats} guest${seats > 1 ? 's' : ''}`;

  document.getElementById("vp-val").textContent = `₹${price}`;
};

/* ═══════════════════════════════════════
   INIT (CRITICAL)
═══════════════════════════════════════ */
window.onload = function() {

  // reveal animations
  document.querySelectorAll('.rev').forEach(el => el.classList.add('vis'));

  document.querySelectorAll('.cr').forEach((el, i) => {
    setTimeout(() => el.classList.add('vis'), i * 100);
  });

  // 🔥 FORCE FORM LOAD
  setTimeout(() => renderForms(), 100);

  // load availability
  fetchAvailability();
};
