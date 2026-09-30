"use strict";
// A short, original bell arpeggio. No media download or network is needed.
window.scoreboardSound = (() => {
  let context;
  let lastPlayed = 0;
  return async function play(volume = 45) {
    if (volume <= 0 || Date.now() - lastPlayed < 1200) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    lastPlayed = Date.now();
    try {
      context ??= new Audio();
      if (context.state === "suspended") await context.resume();
      const start = context.currentTime + .03;
      const level = Math.min(100, Math.max(0, volume)) / 100;
      [[523.25, 0], [659.25, .14], [783.99, .28], [1046.5, .48]].forEach(([frequency, offset]) => {
        [1, 2].forEach((harmonic) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = "sine";
          oscillator.frequency.value = frequency * harmonic;
          gain.gain.setValueAtTime(0, start + offset);
          gain.gain.linearRampToValueAtTime(level * (harmonic === 1 ? .15 : .022), start + offset + .015);
          gain.gain.exponentialRampToValueAtTime(.0001, start + offset + .9);
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(start + offset);
          oscillator.stop(start + offset + 1);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        });
      });
    } catch { /* A disconnected output must not stop live scoring. */ }
  };
})();
