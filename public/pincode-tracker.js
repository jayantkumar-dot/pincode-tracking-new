/*
  SEPARATE PINCODE TRACKER
  ------------------------
  This file does NOT modify the existing SandeepEdd class.
  It observes the existing widget from outside.

  IMPORTANT:
  1. Change TRACKING_URL to your deployed /api/track endpoint.
  2. Change TRACKER_KEY to the same value used by TRACKER_API_KEY.
*/

(() => {
  const TRACKING_URL = "https://YOUR-TRACKING-DOMAIN.com/api/track";
  const TRACKER_KEY = "YOUR_TRACKER_API_KEY";

  const SESSION_KEY = "edd_tracking_session_id";

  function getSessionId() {
    try {
      let id = sessionStorage.getItem(SESSION_KEY);

      if (!id) {
        id = "edd_" + (
          crypto.randomUUID
            ? crypto.randomUUID()
            : Date.now() + "_" + Math.random().toString(36).slice(2)
        );

        sessionStorage.setItem(SESSION_KEY, id);
      }

      return id;
    } catch (_) {
      return "edd_" + Date.now();
    }
  }

  function getProductContext() {
    const productMeta = window.ShopifyAnalytics?.meta?.product;

    const parts = window.location.pathname.split("/products/");
    const productHandle =
      parts[1]?.split("/")[0] || null;

    return {
      product_id: productMeta?.id
        ? String(productMeta.id)
        : null,

      product_handle: productHandle,

      variant_id: window.ShopifyAnalytics?.meta?.selectedVariantId
        ? String(window.ShopifyAnalytics.meta.selectedVariantId)
        : null,

      page_url: window.location.href
    };
  }

  function send(payload) {
    const body = JSON.stringify({
      ...payload,
      ...getProductContext(),
      session_id: getSessionId()
    });

    fetch(TRACKING_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tracker-key": TRACKER_KEY
      },
      body,
      keepalive: true
    }).catch(() => {
      // Tracking must never interfere with the existing EDD widget.
    });
  }

  function getWidget() {
    return document.querySelector("sandeep-edd .pc-widget");
  }

  function getPincode() {
    return document.querySelector("sandeep-edd .pc-input")?.value || "";
  }

  function getDeliveryDate() {
    const first =
      document.querySelector("sandeep-edd [data-pc-date-first]")?.textContent?.trim();

    const range =
      document.querySelector("sandeep-edd [data-pc-date]")?.textContent?.trim();

    return first || range || null;
  }

  let lastCheckPincode = "";
  let lastState = "";

  function observeState() {
    const widget = getWidget();
    if (!widget) return;

    const state = widget.dataset.state || "";

    if (state === lastState) return;
    lastState = state;

    /*
      The existing code changes:
      loading -> express / standard / unavail / error

      So we track only the final result states.
    */
    if (
      state === "express" ||
      state === "standard" ||
      state === "unavail" ||
      state === "error"
    ) {
      const pin = getPincode();

      if (!/^\d{6}$/.test(pin)) return;

      if (state === "express") {
        send({
          pincode: pin,
          result: "serviceable",
          delivery_type: "express",
          delivery_date: getDeliveryDate()
        });
      }

      if (state === "standard") {
        send({
          pincode: pin,
          result: "serviceable",
          delivery_type: "standard",
          delivery_date: getDeliveryDate()
        });
      }

      if (state === "unavail") {
        send({
          pincode: pin,
          result: "unavailable",
          delivery_type: null,
          delivery_date: null
        });
      }

      if (state === "error") {
        send({
          pincode: pin,
          result: "error",
          delivery_type: null,
          delivery_date: null
        });
      }

      lastCheckPincode = pin;
    }
  }

  function init() {
    const widget = getWidget();

    if (!widget) {
      setTimeout(init, 1000);
      return;
    }

    /*
      Observe only the existing data-state attribute.
      We do NOT change the existing widget/class/code.
    */
    const observer = new MutationObserver(observeState);

    observer.observe(widget, {
      attributes: true,
      attributeFilter: ["data-state"]
    });

    observeState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
