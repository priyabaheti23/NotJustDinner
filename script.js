// WAIT FOR PAGE LOAD
document.addEventListener("DOMContentLoaded", function () {

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
