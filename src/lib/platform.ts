export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as any).standalone === true;

// On iOS, only Safari can install a PWA. Chrome/Firefox/Edge on iOS use WKWebView
// and can only add bookmarks. Detect Safari by the absence of browser-specific tokens.
export const isIOSSafari = () => {
  if (!isIOS()) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent);
};
