'use strict';

/* ═══════════════════════════════════════
   CONFIG
═══════════════════════════════════════ */
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw_MO48-U0Nr_S3PxwrDWr1LahqJqJ7wgCo8GroQoFW9Zz6e85OhGpoxwgNtN2_RXJj/exec';
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
   TAB SWITCHING
═══════════════════════════════════════ */
window.switchTab = function(tab) {
  ['community','private','gift'].forEach(id => {
    const tabEl = document.getElementById('tab-' + id);
    const panel = document.getElementById('panel-' + id);

    tabEl.classList.toggle('on', id === tab);
    panel.classList.toggle('on', id === tab);
  });
};

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
      cell.className = 'day avail';
      cell.onclick = () => selectDate(d, cell);
    } else {
      cell.className = 'day other';
    }

    grid.appendChild(cell);
  }
}

function selectDate(d, cell) {
  document.querySelectorAll('.day.sel').forEach(c => c.classList.remove('sel'));
  cell.classList.add('sel');
  selectedDate = d;
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
  document.getElementById('c-sub').textContent = `for ${gCount} guest${gCount > 1 ? 's' : ''}`;
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
   SUBMIT
═══════════════════════════════════════ */
window.submitCommunity = function() {
  if (!selectedDate) {
    document.getElementById('cal-err').style.display = 'block';
    return;
  }

  alert("Booking submitted (connect Google Sheets next)");
};

/* ═══════════════════════════════════════
   GIFT PRICE
═══════════════════════════════════════ */
window.updateGiftPrice = function(seats) {
  const price = PRICE * seats;

  document.getElementById("g-amt").innerHTML = `<sup>₹</sup>${price}`;
  document.getElementById("g-sub").textContent = `for ${seats} seat${seats > 1 ? 's' : ''}`;

  document.getElementById("vp-seats").textContent = `${seats} guest${seats > 1 ? 's' : ''}`;
  document.getElementById("vp-val").textContent = `₹${price}`;
};

/* ═══════════════════════════════════════
   REVEAL FIX (CRITICAL)
═══════════════════════════════════════ */
window.addEventListener("load", () => {
  document.querySelectorAll('.rev').forEach(el => el.classList.add('vis'));

  document.querySelectorAll('.cr').forEach((el, i) => {
    setTimeout(() => el.classList.add('vis'), i * 100);
  });

  buildCal(); // load calendar
});
