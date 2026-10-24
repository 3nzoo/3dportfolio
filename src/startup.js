// Inlined before the module entry; preserve the original loading presentation.
(() => {
  const screen = document.querySelector('#loading-screen');
  const message = document.querySelector('#loading-message');
  let ready = false;
  let failed = false;
  function wait(event) {
    ready = false;
    failed = false;
    screen.classList.remove('is-loaded');
    screen.removeAttribute('aria-hidden');
    message.textContent = event?.detail?.message || 'Preparing the 3D machine…';
  }
  function fail() {
    failed = true;
    screen.classList.remove('is-loaded');
    screen.removeAttribute('aria-hidden');
    message.textContent = navigator.onLine === false
      ? 'You’re offline. Reconnect and reload this page to load the board.'
      : 'The 3D machine couldn’t load. Check your connection and reload this page.';
  }
  window.addEventListener('board:waiting', wait);
  window.addEventListener('board:error', fail);
  window.addEventListener('board:ready', () => {
    ready = true;
    failed = false;
    screen.classList.add('is-loaded');
    screen.setAttribute('aria-hidden', 'true');
  });
  window.addEventListener('error', event => {
    if (!ready && (event.message || event.target?.type === 'module')) fail();
  }, true);
  window.addEventListener('unhandledrejection', () => { if (!ready) fail(); });
  window.addEventListener('offline', () => { if (!ready) fail(); });
  window.addEventListener('online', () => {
    if (ready) return;
    if (failed) message.textContent = 'Connection restored. Reload this page to load the 3D machine.';
    else wait();
  });
  wait();
})();
