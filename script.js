  // TAB SWITCHING
  window.switchTab = function(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('on'));

    document.getElementById(`tab-${tab}`).classList.add('on');
    document.getElementById(`panel-${tab}`).classList.add('on');
  };

  // GUEST COUNT
  let guestCount = 1;
  const pricePerGuest = 1999;

  window.changeG = function(val) {
    guestCount += val;

    if (guestCount < 1) guestCount = 1;
    if (guestCount > 4) {
      guestCount = 4;
      document.getElementById("g-err").style.display = "block";
    } else {
      document.getElementById("g-err").style.display = "none";
    }

    document.getElementById("gc-n").textContent = guestCount;
    document.getElementById("gc-tot").textContent = `₹${guestCount * pricePerGuest}`;

    document.getElementById("c-amt").innerHTML = `<sup>₹</sup>${guestCount * pricePerGuest}`;
    document.getElementById("c-sub").textContent = `for ${guestCount} guest${guestCount > 1 ? 's' : ''}`;

    document.getElementById("gc-").disabled = guestCount === 1;
  };

  // COPY UPI
  window.copyUPI = function() {
    const text = document.getElementById("upiText").textContent;
    navigator.clipboard.writeText(text);

    const msg = document.getElementById("copyMsg");
    msg.style.opacity = 1;

    setTimeout(() => {
      msg.style.opacity = 0;
    }, 1500);
  };

  // COMMUNITY SUBMIT
  window.submitCommunity = function() {
    alert("Booking submitted (connect Google Sheets next)");
  };

  // GIFT PRICE
  window.updateGiftPrice = function(seats) {
    const price = 1999 * seats;

    document.getElementById("g-amt").innerHTML = `<sup>₹</sup>${price}`;
    document.getElementById("g-sub").textContent = `for ${seats} seat${seats > 1 ? 's' : ''}`;

    document.getElementById("vp-seats").textContent = `${seats} guest${seats > 1 ? 's' : ''}`;
    document.getElementById("vp-val").textContent = `₹${price}`;
  };

});

/* ════════════════════════════════════════════
   CONFIG
════════════════════════════════════════════ */
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw_MO48-U0Nr_S3PxwrDWr1LahqJqJ7wgCo8GroQoFW9Zz6e85OhGpoxwgNtN2_RXJj/exec';
const MAX_SEATS  = 8;
const PRICE      = 1999;

// April 2026: Sat=4,11,18,25  Sun=5,12,19,26  starts Wednesday (index 3)
const SAT = [4,11,18,25];
const SUN = [5,12,19,26];
const AVAIL_DAYS = [...SAT,...SUN];

/* ════════════════════════════════════════════
   STATE
════════════════════════════════════════════ */
let selectedDate  = null;
let availability  = {};   // { "Saturday, 4 April 2026": 6, … }  booked count
let gCount        = 1;
let availFetched  = false;

/* ════════════════════════════════════════════
   TABS
════════════════════════════════════════════ */
function switchTab(t) {
  ['community','private','gift'].forEach(id => {
    const tab   = document.getElementById('tab-'+id);
    const panel = document.getElementById('panel-'+id);
    const on    = id === t;
    tab.classList.toggle('on', on);
    tab.setAttribute('aria-selected', on);
    panel.classList.toggle('on', on);
  });
  setTimeout(() => document.getElementById('book').scrollIntoView({behavior:'smooth',block:'start'}), 50);
}

/* ════════════════════════════════════════════
   AVAILABILITY — fetch from Google Sheet
════════════════════════════════════════════ */
function fetchAvailability() {
  fetch(SCRIPT_URL, {mode:'no-cors'})
    .then(r => { if(r.type==='opaque') return; return r.json(); })
    .then(data => {
      if (data) availability = data;
      availFetched = true;
      updateCalendarUI();
      hideCalLoading();
    })
    .catch(() => {
      availFetched = true;
      updateCalendarUI();
      hideCalLoading();
    });

  // Fallback: if no response in 3s, draw calendar with no availability data
  setTimeout(() => {
    if (!availFetched) { availFetched = true; updateCalendarUI(); hideCalLoading(); }
  }, 3000);
}

function hideCalLoading() {
  const el = document.getElementById('cal-loading');
  if (el) el.style.display = 'none';
}

/* ════════════════════════════════════════════
   CALENDAR
════════════════════════════════════════════ */
function buildCal() {
  const grid  = document.getElementById('cal-comm');
  const today = new Date(); today.setHours(0,0,0,0);
  while (grid.children.length > 7) grid.removeChild(grid.lastChild);

  // April 2026 starts Wednesday = index 3 (Sun=0)
  for (let i=0; i<3; i++) {
    const e = document.createElement('div');
    e.className = 'day empty'; e.setAttribute('aria-hidden','true');
    grid.appendChild(e);
  }

  for (let d = 1; d <= 30; d++) {
    const cell   = document.createElement('div');
    const date   = new Date(2026, 3, d);
    const isPast = date < today;
    const isSat  = SAT.includes(d);
    const isSun  = SUN.includes(d);
    const isAvail= !isPast && (isSat || isSun);
    const dayName= isSat ? 'Saturday' : 'Sunday';
    const dateKey= `${dayName}, ${d} April 2026`;

    const numEl  = document.createElement('span'); numEl.className='day-num'; numEl.textContent=d;

    if (isPast) {
      cell.className='day past'; cell.setAttribute('aria-disabled','true');
      cell.setAttribute('aria-label',`${d} April, past`);
      cell.appendChild(numEl);
    } else if (isAvail) {
      const booked    = availability[dateKey] || 0;
      const remaining = MAX_SEATS - booked;

      if (remaining <= 0) {
        // Fully booked
        cell.className='day full';
        cell.setAttribute('aria-disabled','true');
        cell.setAttribute('aria-label',`${dayName} ${d} April, fully booked`);
        cell.appendChild(numEl);
        const seatsEl = document.createElement('span'); seatsEl.className='day-seats'; seatsEl.textContent='Full';
        cell.appendChild(seatsEl);
        const dot=document.createElement('div'); dot.className='day-dot'; cell.appendChild(dot);
      } else {
        cell.className = 'day avail' + (remaining <= 2 ? ' almost' : '');
        cell.setAttribute('role','button');
        cell.setAttribute('tabindex','0');
        cell.setAttribute('aria-label',`${dayName} ${d} April, ${remaining} seat${remaining!==1?'s':''} left`);
        cell.appendChild(numEl);
        const seatsEl = document.createElement('span'); seatsEl.className='day-seats';
        seatsEl.textContent = remaining <= 2 ? `${remaining} left 🔥` : `${remaining} left`;
        cell.appendChild(seatsEl);
        const dot=document.createElement('div'); dot.className='day-dot'; cell.appendChild(dot);
        cell.addEventListener('click', () => selectDate(d, cell, dateKey, remaining));
        cell.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' ') selectDate(d,cell,dateKey,remaining); });
      }
    } else {
      cell.className='day other'; cell.setAttribute('aria-hidden','true');
      cell.appendChild(numEl);
    }
    grid.appendChild(cell);
  }
}

function updateCalendarUI() {
  // rebuild with fresh availability data
  buildCal();
}

function selectDate(d, cell, dateKey, remaining) {
  // Overbooking guard
  if (remaining < gCount) {
    alert(`Only ${remaining} seat${remaining!==1?'s':''} left on this date. Please reduce your guest count.`);
    return;
  }
  document.querySelectorAll('.day.sel').forEach(c => c.classList.remove('sel'));
  cell.classList.add('sel');
  selectedDate = dateKey;
  document.getElementById('cal-err').style.display = 'none';
}

/* ════════════════════════════════════════════
   GUEST COUNTER
════════════════════════════════════════════ */
function changeG(delta) {
  const next = gCount + delta;
  if (next > 4) { document.getElementById('g-err').style.display='block'; return; }
  document.getElementById('g-err').style.display = 'none';
  if (next < 1) return;
  gCount = next;
  document.getElementById('gc-n').textContent  = gCount;
  document.getElementById('gc-').disabled       = gCount <= 1;
  document.getElementById('gc+').disabled       = gCount >= 4;
  document.getElementById('gc-tot').textContent = '₹' + (PRICE*gCount).toLocaleString('en-IN');
  document.getElementById('c-amt').innerHTML    = '<sup>₹</sup>' + (PRICE*gCount).toLocaleString('en-IN');
  document.getElementById('c-sub').textContent  = `for ${gCount} guest${gCount>1?'s':''} · all-inclusive`;
  renderForms();
}

/* ════════════════════════════════════════════
   MEMBER FORMS
   Guest 1: full details | Others: name + dietary only
════════════════════════════════════════════ */
function renderForms() {
  const wrap = document.getElementById('member-forms'); wrap.innerHTML = '';
  for (let i = 1; i <= gCount; i++) {
    const isFirst = i === 1;
    wrap.innerHTML += `
    <div class="mbl">
      <div class="mbl-title">Guest ${i}</div>
      <div class="fgrid">
        <div class="ff"><label for="gn${i}">Full Name *</label>
          <input type="text" name="g${i}_name" id="gn${i}" placeholder="Full name" required autocomplete="${isFirst?'name':'off'}"></div>
        <div class="ff"><label for="gw${i}">Dietary Preference *</label>
          <select name="g${i}_diet" id="gw${i}" required>
            <option value="">Select one</option>
            <option>Egg in dessert OK</option>
            <option>Egg in dessert NOT OK</option>
          </select></div>
        ${isFirst ? `
        <div class="ff"><label for="gwa1">WhatsApp Number *</label>
          <input type="tel" name="g1_wa" id="gwa1" placeholder="10-digit number" required autocomplete="tel"></div>
        <div class="ff">
          <label for="gsoc">Social Platform *</label>
          <select name="social_platform" id="gsoc" required>
            <option value="">Select one</option>
            <option>Instagram</option><option>LinkedIn</option><option>X (Twitter)</option>
          </select></div>
        <div class="ff"><label for="ghdl">Your Handle *</label>
          <input type="text" name="social_username" id="ghdl" placeholder="@yourhandle"></div>
        <div class="ff">
          <label for="gsrc">How did you hear about us? *</label>
          <select name="source" id="gsrc" required>
            <option value="">Select one</option>
            <option>Instagram</option><option>Twitter / X</option><option>Friend / Previous Guest</option>
          </select></div>` : ''}
      </div>
    </div>`;
  }
}
renderForms();

/* ════════════════════════════════════════════
   GIFT PRICE UPDATE
════════════════════════════════════════════ */
function updateGiftPrice(seats) {
  const n     = parseInt(seats) || 1;
  const total = (PRICE*n).toLocaleString('en-IN');
  document.getElementById('g-amt').innerHTML   = '<sup>₹</sup>' + total;
  document.getElementById('g-sub').textContent = `for ${n} seat${n>1?'s':''} · all-inclusive`;
  document.getElementById('vp-seats').textContent = `${n} guest${n>1?'s':''}`;
  document.getElementById('vp-val').textContent   = '₹' + total;
}

/* ════════════════════════════════════════════
   SUBMIT — COMMUNITY
════════════════════════════════════════════ */
function submitCommunity() {
  if (!selectedDate) {
    document.getElementById('cal-err').style.display = 'block';
    document.querySelector('.cal-shell').scrollIntoView({behavior:'smooth',block:'start'});
    return;
  }

  // Overbooking guard
  const booked    = availability[selectedDate] || 0;
  const remaining = MAX_SEATS - booked;
  if (remaining < gCount) {
    alert(`Sorry, only ${remaining} seat${remaining!==1?'s':''} remain on this date. Please pick another date or reduce guests.`);
    return;
  }

  const fd = new FormData();
  fd.append('booking_type', 'Community Dining');
  fd.append('dinner_date', selectedDate);
  fd.append('guest_count', gCount);
  document.getElementById('member-forms').querySelectorAll('input,select').forEach(el => {
    if (el.name) fd.append(el.name, el.value);
  });

  const btn = document.getElementById('comm-submit');
  btn.disabled = true; btn.textContent = 'Submitting…';

  fetch(SCRIPT_URL, {method:'POST', body:fd, mode:'no-cors'})
    .finally(() => {
      // Optimistically update local availability
      availability[selectedDate] = (availability[selectedDate] || 0) + gCount;
      document.getElementById('m-community').style.display = 'flex';
      document.body.style.overflow = 'hidden';
      btn.disabled = false; btn.textContent = "I've Paid — Confirm My Seat(s)";
    });
}

/* ════════════════════════════════════════════
   SUBMIT — PRIVATE
════════════════════════════════════════════ */
document.getElementById('privateForm').addEventListener('submit', () => {
  const btn = document.getElementById('pd-submit');
  btn.disabled = true; btn.textContent = 'Submitting…';
  setTimeout(() => {
    document.getElementById('m-private').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    document.getElementById('privateForm').reset();
    btn.disabled = false; btn.textContent = "I've Paid — Request Private Dining";
  }, 900);
});

/* ════════════════════════════════════════════
   SUBMIT — GIFT
════════════════════════════════════════════ */
document.getElementById('giftForm').addEventListener('submit', () => {
  const btn = document.getElementById('gf-submit');
  btn.disabled = true; btn.textContent = 'Submitting…';
  setTimeout(() => {
    document.getElementById('m-gift').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    document.getElementById('giftForm').reset();
    btn.disabled = false; btn.textContent = "I've Paid — Send the Voucher";
  }, 900);
});

/* ════════════════════════════════════════════
   UTILS
════════════════════════════════════════════ */
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
  document.body.style.overflow = 'auto';
}

function copyUPI() {
  navigator.clipboard.writeText('baheti.priya@yescred').catch(() => {});
  const t = document.getElementById('copyMsg');
  if (t) { t.style.opacity='1'; setTimeout(()=>t.style.opacity='0', 1800); }
}

/* ════════════════════════════════════════════
   SCROLL REVEAL
════════════════════════════════════════════ */
const obs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('vis');
    e.target.querySelectorAll('.cr').forEach((r,i) => setTimeout(()=>r.classList.add('vis'), i*90));
    obs.unobserve(e.target);
  });
}, {threshold:.07});
document.querySelectorAll('.rev').forEach(el => obs.observe(el));

/* ════════════════════════════════════════════
   STICKY CTA — hide when booking section visible
════════════════════════════════════════════ */
const bookSec = document.getElementById('book');
const stickyObs = new IntersectionObserver(entries => {
  const sticky = document.querySelector('.sticky-cta');
  if (sticky) sticky.style.display = entries[0].isIntersecting ? 'none' : 'flex';
}, {threshold:.1});
if (bookSec) stickyObs.observe(bookSec);

/* ════════════════════════════════════════════
   INIT — build calendar then fetch live data
════════════════════════════════════════════ */
buildCal();
fetchAvailability();



// FIX: show hidden sections
window.addEventListener("load", () => {
  document.querySelectorAll('.rev').forEach(el => {
    el.classList.add('vis');
  });

  document.querySelectorAll('.cr').forEach((el, i) => {
    setTimeout(() => el.classList.add('vis'), i * 100);
  });
});

