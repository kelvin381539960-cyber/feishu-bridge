/* ============================================
   Audio System - Sound Effects & TTS
   ============================================ */

const AudioSystem = (() => {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  function ensureContext() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playTone(freq, duration, type = 'sine', gain = 0.3) {
    ensureContext();
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(g).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }

  function playCorrect() {
    playTone(523, 0.15, 'sine', 0.3);
    setTimeout(() => playTone(659, 0.15, 'sine', 0.3), 100);
    setTimeout(() => playTone(784, 0.25, 'sine', 0.3), 200);
  }

  function playWrong() {
    playTone(200, 0.3, 'sawtooth', 0.15);
    setTimeout(() => playTone(180, 0.3, 'sawtooth', 0.15), 150);
  }

  function playStar() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => {
      setTimeout(() => playTone(n, 0.2, 'sine', 0.25), i * 80);
    });
  }

  function playClick() {
    playTone(800, 0.05, 'sine', 0.15);
  }

  function playComplete() {
    const melody = [523, 659, 784, 880, 1047];
    melody.forEach((n, i) => {
      setTimeout(() => playTone(n, 0.3, 'sine', 0.25), i * 120);
    });
  }

  function speak(text, lang = 'zh-CN') {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = 0.8;
    utter.pitch = 1.2;
    window.speechSynthesis.speak(utter);
  }

  return { playCorrect, playWrong, playStar, playClick, playComplete, speak };
})();
