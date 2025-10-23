if (import.meta && import.meta.env && import.meta.env.DEV) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/dev-sw.js?dev-sw', { scope: '/', type: 'classic' });
  }
} else {
  // En prod : ne rien faire ici.
}