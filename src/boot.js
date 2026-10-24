// Keep the entry small so the HTML loader can paint before the 3D download.
new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  .then(() => import('./main.js'))
  .catch(error => {
  console.error('Could not start the portfolio board:', error);
  window.dispatchEvent(new CustomEvent('board:error'));
});
