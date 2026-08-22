/* ===================== REGISTRATION + PAYMENT FLOW =====================
   Modal open/close (openRegisterModal/closeRegisterModal, the overlay
   click-outside listener, and the Escape-key listener) are already
   defined in the inline <script> inside index.html — not redeclared
   here to avoid a duplicate top-level `const registerOverlay`. */

document.addEventListener("DOMContentLoaded", () => {
  const registerForm = document.getElementById("register-form");
  const modalSubmitBtn = document.getElementById("modal-submit-btn");
  const modalStatus = document.getElementById("modal-status");
  const dateSelect = document.getElementById("reg-date");
  const timeSelect = document.getElementById("reg-time");

  if (!registerForm || !modalSubmitBtn || !modalStatus || !dateSelect || !timeSelect) {
    console.warn("Registration form elements not found");
    return;
  }

  const API_BASE = "http://localhost:3004"; // set to your API origin if different

  function setStatus(message, type) {
    modalStatus.textContent = message;
    modalStatus.classList.remove("show", "success", "error");
    modalStatus.classList.add("show", type);
  }

  function setLoading(isLoading, label) {
    modalSubmitBtn.disabled = isLoading;
    modalSubmitBtn.textContent = label;
  }

  /* -----------------------------------------------------------------------
     SLOT AVAILABILITY
     Whenever the date changes, fetch seat counts for that date and
     rebuild the time dropdown — full slots are shown but disabled.
  ----------------------------------------------------------------------- */
  async function loadSlotsForDate(date) {
    timeSelect.innerHTML = '<option value="" disabled selected>Loading slots...</option>';
    timeSelect.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/api/registrations/availability?date=${encodeURIComponent(date)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load slots.");

      timeSelect.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.disabled = true;
      placeholder.selected = true;
      placeholder.textContent = "Select a slot";
      timeSelect.appendChild(placeholder);

      data.slots.forEach((slot) => {
        const opt = document.createElement("option");
        opt.value = slot.time;
        opt.textContent = slot.full
          ? `${slot.time} — Full`
          : `${slot.time} (${slot.available} seat${slot.available === 1 ? "" : "s"} left)`;
        opt.disabled = slot.full;
        timeSelect.appendChild(opt);
      });

      timeSelect.disabled = false;
    } catch (err) {
      timeSelect.innerHTML = '<option value="" disabled selected>Could not load slots — try again</option>';
      console.error("Slot availability fetch failed:", err);
    }
  }

  dateSelect.addEventListener("change", () => {
    if (dateSelect.value) loadSlotsForDate(dateSelect.value);
  });

  /* -----------------------------------------------------------------------
     SUBMIT
  ----------------------------------------------------------------------- */
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    modalStatus.classList.remove("show", "success", "error");

    const formData = {
      name: document.getElementById("reg-name").value.trim(),
      phone: document.getElementById("reg-phone").value.trim(),
      email: document.getElementById("reg-email").value.trim(),
      age: Number(document.getElementById("reg-age").value),
      preferredDate: document.getElementById("reg-date").value,
      preferredTime: document.getElementById("reg-time").value,
      source: document.getElementById("reg-source").value,
      reason: document.getElementById("reg-reason").value,
    };

    if (
      !formData.name ||
      !formData.phone ||
      !formData.email ||
      !formData.age ||
      !formData.preferredDate ||
      !formData.preferredTime ||
      !formData.source ||
      !formData.reason
    ) {
      setStatus("Please fill in all required fields.", "error");
      return;
    }

    // Phone must be exactly 10 digits (strip spaces/dashes/+91 etc. first)
    const phoneDigits = formData.phone.replace(/\D/g, "").slice(-10);
    if (!/^[0-9]{10}$/.test(phoneDigits)) {
      setStatus("Enter a valid 10-digit phone number.", "error");
      return;
    }
    formData.phone = phoneDigits;

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(formData.email)) {
      setStatus("Enter a valid email address.", "error");
      return;
    }

    setLoading(true, "Processing...");

    try {
      const keyRes = await fetch(`${API_BASE}/api/payment/key`);
      if (!keyRes.ok) throw new Error("Failed to get payment key");
      const { key } = await keyRes.json();

      const orderRes = await fetch(`${API_BASE}/api/payment/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration: formData }),
      });
      const order = await orderRes.json();

      // Slot filled up between selection and submit (server-side check).
      if (orderRes.status === 409) {
        setLoading(false, "Pay ₹699 & Register");
        setStatus(order.error || "That slot just filled up. Please pick another.", "error");
        loadSlotsForDate(formData.preferredDate); // refresh dropdown so it reflects reality
        return;
      }

      if (!orderRes.ok) throw new Error(order.error || "Could not start payment.");

      setLoading(false, "Pay ₹699 & Register");

      const rzp = new Razorpay({
        key,
        amount: order.amount,
        currency: order.currency,
        order_id: order.id,
        name: "Reboot Mental Health Center",
        description: "Mental Health Camp Registration",
        prefill: {
          name: formData.name,
          contact: formData.phone,
          email: formData.email,
        },
        method: {
          netbanking: true,
          card: true,
          upi: true,
          wallet: false,
          emi: false,
          paylater: false,
        },
        theme: { color: "#ffc107" },
        handler: async (response) => {
          await completeRegistration(formData, response);
        },
        modal: {
          ondismiss: () => {
            setStatus("Payment cancelled. You can try again anytime.", "error");
          },
        },
      });

      rzp.on("payment.failed", () => {
        setStatus("Payment failed. Please try again.", "error");
      });

      rzp.open();
    } catch (err) {
      setLoading(false, "Pay ₹699 & Register");
      setStatus(err.message || "Something went wrong. Please try again.", "error");
    }
  });

  async function completeRegistration(formData, razorpayResponse) {
    setLoading(true, "Verifying payment...");

    try {
      const verifyRes = await fetch(`${API_BASE}/api/payment/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpay_order_id: razorpayResponse.razorpay_order_id,
          razorpay_payment_id: razorpayResponse.razorpay_payment_id,
          razorpay_signature: razorpayResponse.razorpay_signature,
        }),
      });
      const verifyData = await verifyRes.json();

      if (!verifyRes.ok || !verifyData.success) {
        throw new Error("Payment verification failed. Contact us with your payment ID: " + razorpayResponse.razorpay_payment_id);
      }

      const regRes = await fetch(`${API_BASE}/api/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          paymentId: razorpayResponse.razorpay_payment_id,
          orderId: razorpayResponse.razorpay_order_id,
        }),
      });
      const regData = await regRes.json();

      if (!regRes.ok) throw new Error(regData.error || "Payment succeeded but registration failed to save.");

      registerForm.reset();
      timeSelect.innerHTML = '<option value="" disabled selected>Select a date first</option>';

      const successParams = new URLSearchParams({
        ref: regData.referenceNumber,
        name: formData.name,
        date: formData.preferredDate,
        time: formData.preferredTime,
      });
      window.location.href = `success.html?${successParams.toString()}`;
      return;
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      setLoading(false, "Pay ₹699 & Register");
    }
  }
});