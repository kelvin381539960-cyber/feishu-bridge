/* ============================================
   App Entry Point
   ============================================ */

(function() {
  document.addEventListener('click', () => {
    if (typeof AudioContext !== 'undefined') {
      const ctx = new AudioContext();
      if (ctx.state === 'suspended') ctx.resume();
      ctx.close();
    }
  }, { once: true });

  Screens.renderHome();
})();
