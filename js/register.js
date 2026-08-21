/* ===================== REGISTRATION + PAYMENT FLOW =====================
   Modal open/close (openRegisterModal/closeRegisterModal, the overlay
   click-outside listener, and the Escape-key listener) are already
   defined in the inline <script> inside index.html — not redeclared
   here to avoid a duplicate top-level `const registerOverlay`. */

document.addEventListener("DOMContentLoaded", () => {
  const registerForm = document.getElementById("register-form");
  const modalSubmitBtn = document.getElementById("modal-submit-btn");
  const modalStatus = document.getElementById("modal-status");

  // Check if elements exist before proceeding
  if (!registerForm || !modalSubmitBtn || !modalStatus) {
    console.warn("Registration form elements not found");
    return;
  }

  const API_BASE = "http://localhost:3004"; // set to your API origin if different, e.g. "https://api.rebootmentalhealth.in"

  function setStatus(message, type) {
    modalStatus.textContent = message;
    modalStatus.classList.remove("show", "success", "error");
    modalStatus.classList.add("show", type);
  }

  function setLoading(isLoading, label) {
    modalSubmitBtn.disabled = isLoading;
    modalSubmitBtn.textContent = label;
  }

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    modalStatus.classList.remove("show", "success", "error");

    const formData = {
      name: document.getElementById("reg-name").value.trim(),
      phone: document.getElementById("reg-phone").value.trim(),
      age: Number(document.getElementById("reg-age").value),
      preferredDate: document.getElementById("reg-date").value,
      preferredTime: document.getElementById("reg-time").value,
      source: document.getElementById("reg-source").value,
      reason: document.getElementById("reg-reason").value,
    };

    // Basic validation
    if (!formData.name || !formData.phone || !formData.age || !formData.preferredDate || !formData.preferredTime) {
      setStatus("Please fill in all required fields.", "error");
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

      if (!orderRes.ok) throw new Error(order.error || "Could not start payment.");

      setLoading(false, "Pay ₹499 & Register");

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
      setLoading(false, "Pay ₹499 & Register");
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

      setStatus(
        `Registration confirmed! Reference: ${regData.referenceNumber}. We'll email/WhatsApp your camp details.`,
        "success"
      );
      registerForm.reset();
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      setLoading(false, "Pay ₹499 & Register");
    }
  }
});