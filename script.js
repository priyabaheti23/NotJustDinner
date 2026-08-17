'use strict';

/* ═══════════════════════════════════════
   CONFIG
═══════════════════════════════════════ */
const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbwDaM6f1PEJkCVk8ydRi4j65pZALJnyacRQaMTg2Tz8q6NhPHKwnYcSXL27mXjLWjTQcw/exec'; // Razorpay + Community Dining bookings
const MAX_SEATS   = 8;
const PRICE       = 2999;

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let selectedDate = null;
let availability = {};
let gCount       = 1;
let wizStep      = 1;
let appliedCoupon = null; // { code, discountPercent } — Community Dining only

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
function fetchAvailability() {
  fetch(BACKEND_URL)
    .then(r => r.json())
    .then(data => {
      availability = {};
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
        availability[dateKey] = (availability[dateKey] || 0) + value;
      });
      buildCal();
    })
    .catch(() => buildCal());
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
  const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // ── Event month — always the real current month ──
  const viewYear  = now.getFullYear();
  const viewMonth = now.getMonth();
  const OPEN_DATES = getSaturdaysOfMonth_(viewYear, viewMonth);

  // Update heading
  const monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
  const headEl = document.getElementById('cal-head');
  if (headEl) headEl.textContent = `${monthNames[viewMonth]} ${viewYear}`;

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
    const isPast    = thisDate < today;
    const key       = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isOpen    = OPEN_DATES.includes(key);

    cell.innerHTML = `<span class="day-num">${d}</span>`;

    if (isPast) {
      cell.className = 'day past';
    } else if (isOpen) {

      const booked    = availability[key] || 0;
      const remaining = MAX_SEATS - booked;

      if (remaining <= 0) {
        cell.className = 'day full';
        cell.innerHTML += `<span class="day-seats">Full</span>`;
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
  const nextBtn = document.getElementById('wiz-next-1');
  if (nextBtn) nextBtn.disabled = false;
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

    document.getElementById(`guest_name_${i}`).addEventListener('blur', function() {
      this.value.trim() ? hideErr(`err_name_${i}`) : showErr(`err_name_${i}`, 'Name is required');
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
      this.value ? hideErr(`err_diet_${i}`) : showErr(`err_diet_${i}`, 'Please select a dietary preference');
    });
    document.getElementById(`guest_username_${i}`).addEventListener('blur', function() {
      this.value.trim() ? hideErr(`err_username_${i}`) : showErr(`err_username_${i}`, 'Social handle is required');
    });
    document.querySelectorAll(`input[name="guest_platform_${i}"]`).forEach(r => {
      r.addEventListener('change', () => hideErr(`err_platform_${i}`));
    });
    if (i === 1) {
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
  document.getElementById('gc-n').textContent = gCount;
  document.getElementById('gc-').disabled      = gCount === 1;
  document.getElementById('gc+').disabled      = gCount === 4;
  hideErr('g-err');
  updatePriceDisplay();
  if (selectedDate) {
    const remaining = MAX_SEATS - (availability[selectedDate] || 0);
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

  const btn = document.getElementById('coupon-apply-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }

  try {
    const res  = await fetch(BACKEND_URL, {
      method: 'POST',
      body  : JSON.stringify({ action: 'validateCoupon', code: code, guestCount: gCount })
    });
    const data = await res.json();

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
    if (!/^\d{10}$/.test(wa)) { showErr(`err_wa_${i}`,       'Enter a valid 10-digit WhatsApp number'); ok = false; }
    if (!diet)                { showErr(`err_diet_${i}`,     'Please select a dietary preference'); ok = false; }
    if (!platform)            { showErr(`err_platform_${i}`, 'Please select a social media platform'); ok = false; }
    if (!handle)              { showErr(`err_username_${i}`, 'Social handle is required'); ok = false; }
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
  btn.textContent = 'Processing…';

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
    const orderRes = await fetch(BACKEND_URL, {
      method: 'POST',
      body: JSON.stringify({
        action     : 'createOrder',
        bookingDate: selectedDate,
        guestCount : gCount,
        couponCode : couponCode
      })
    });
    const order = await orderRes.json();
    if (order.error) throw new Error(order.error);

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
      modal  : { ondismiss: restoreButton },
      handler: async function (response) {
        try {
          const verifyRes = await fetch(BACKEND_URL, {
            method: 'POST',
            body: JSON.stringify({
              action              : 'verifyBooking',
              razorpay_order_id   : response.razorpay_order_id,
              razorpay_payment_id : response.razorpay_payment_id,
              razorpay_signature  : response.razorpay_signature,
              bookingDate         : selectedDate,
              guests              : guests,
              couponCode          : couponCode
            })
          });
          const result = await verifyRes.json();
          if (result.verified) {
            availability[selectedDate] = (availability[selectedDate] || 0) + gCount;
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
    showErr('pay-err', 'Could not start payment. Please try again.');
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
  document.getElementById('comm-submit').disabled = false;
  const nextBtn = document.getElementById('wiz-next-1');
  if (nextBtn) nextBtn.disabled = true;
  updatePriceDisplay();
  renderForms();
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
  btn.textContent = 'Processing…';

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
    const orderRes = await fetch(BACKEND_URL, {
      method: 'POST',
      body: JSON.stringify({
        action     : 'createOrder',
        bookingDate: '',
        guestCount : ggCount
      })
    });
    const order = await orderRes.json();
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
          const verifyRes = await fetch(BACKEND_URL, {
            method: 'POST',
            body: JSON.stringify({
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
              source                : source
            })
          });
          const result = await verifyRes.json();
          if (result.verified) {
            const icon  = document.getElementById('mc-icon');
            const title = document.getElementById('mc-title');
            const body  = document.getElementById('mc-body');
            if (icon)  icon.textContent  = '🎁';
            if (title) title.textContent = 'Gift Sent!';
            if (body)  body.innerHTML    = `The seat${ggCount > 1 ? 's are' : ' is'} reserved for <strong style="font-weight:400">${recipientName}</strong>, valid for 3 months on any upcoming Saturday. We'll be in touch on WhatsApp shortly to arrange the evening.`;
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
  document.getElementById('gg-tot').textContent = '₹2,999';
  document.getElementById('g-amt').innerHTML    = '<sup>₹</sup>2,999';
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
window.onload = function () {
  initScrollReveal();
  initNavScroll();
  renderForms();
  fetchAvailability();
  initLightbox();
  updatePriceDisplay();
  initGiftForm();
  updateGiftPayButton();
};

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
