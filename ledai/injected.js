(function () {
  "use strict";

  const seen = new Set();

  function emit(url) {
    const value = String(url || "").trim();
    if (!value) return;
    if (!/\.m3u8($|[?#])/i.test(value)) return;
    if (seen.has(value)) return;
    seen.add(value);
    window.dispatchEvent(new CustomEvent("ledai-zalo-m3u8", { detail: { url: value } }));
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async function (...args) {
      const requestUrl = typeof args[0] === "string" ? args[0] : args[0]?.url;
      emit(requestUrl);
      const response = await originalFetch.apply(this, args);
      emit(response?.url);
      return response;
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    emit(url);
    return originalOpen.call(this, method, url, ...rest);
  };

  const originalSrc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
  if (originalSrc?.set) {
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      configurable: true,
      enumerable: originalSrc.enumerable,
      get() {
        return originalSrc.get.call(this);
      },
      set(value) {
        emit(value);
        return originalSrc.set.call(this, value);
      }
    });
  }

  document.addEventListener("loadedmetadata", (event) => {
    const target = event.target;
    if (target && typeof target.currentSrc === "string") emit(target.currentSrc);
  }, true);
})();
