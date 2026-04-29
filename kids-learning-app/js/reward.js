/* ============================================
   Reward Overlay System
   ============================================ */

const Reward = (() => {
  const overlay = document.getElementById('reward-overlay');
  const iconEl = document.getElementById('reward-icon');
  const textEl = document.getElementById('reward-text');
  const burstEl = document.getElementById('stars-burst');

  const PRAISES = ['太棒了！', '好厉害！', '真聪明！', '你真棒！', '了不起！', '太厉害啦！', '超级棒！', '继续加油！'];

  function show(icon = '⭐', text = null, stars = 1, duration = 1800) {
    return new Promise(resolve => {
      iconEl.textContent = icon;
      textEl.textContent = text || PRAISES[Math.floor(Math.random() * PRAISES.length)];
      createBurst();
      overlay.classList.remove('hidden');

      if (stars > 0) {
        Storage.addStars(stars);
        AudioSystem.playStar();
      }

      setTimeout(() => {
        overlay.classList.add('hidden');
        burstEl.innerHTML = '';
        resolve();
      }, duration);
    });
  }

  function createBurst() {
    burstEl.innerHTML = '';
    const emojis = ['⭐', '✨', '🌟', '💫', '🎉'];
    for (let i = 0; i < 12; i++) {
      const star = document.createElement('span');
      star.className = 'burst-star';
      star.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      const angle = (i / 12) * 360;
      const dist = 60 + Math.random() * 40;
      star.style.left = `${100 + Math.cos(angle * Math.PI / 180) * dist}px`;
      star.style.top = `${100 + Math.sin(angle * Math.PI / 180) * dist}px`;
      star.style.animationDelay = `${Math.random() * 0.3}s`;
      burstEl.appendChild(star);
    }
  }

  overlay.addEventListener('click', () => {
    overlay.classList.add('hidden');
  });

  return { show };
})();
