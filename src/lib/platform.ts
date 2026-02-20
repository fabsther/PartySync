export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as any).standalone === true;
