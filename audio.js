// Lightweight synthesized audio system using the Web Audio API.
// No external sound files are required — everything is generated procedurally,
// which keeps the experience self-contained and avoids missing-asset errors.

class ChocolateAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicNodes = null;
    this.musicOn = true;
    this.unlocked = false;
  }

  _ensureContext() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.9;
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.0;
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.55;
    this.sfxGain.connect(this.masterGain);
  }

  async unlock() {
    this._ensureContext();
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (e) { /* ignore */ }
    }
    this.unlocked = this.ctx.state === 'running';
    if (this.unlocked && this.musicOn && !this.musicNodes) {
      this._startMusic();
    }
    return this.unlocked;
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (!this.ctx) return this.musicOn;
    if (this.musicOn) {
      if (!this.musicNodes) this._startMusic();
      this.musicGain.gain.setTargetAtTime(0.16, this.ctx.currentTime, 0.4);
    } else {
      this.musicGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.4);
    }
    return this.musicOn;
  }

  // --- Ambient generative pad: soft, warm, slowly evolving chord ---
  _startMusic() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const notes = [98.0, 123.47, 146.83, 196.0]; // G2, B2, D3, G3 - warm minor-ish pad
    const oscs = [];
    const gains = [];
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.connect(this.musicGain);

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.22 / (i + 1);
      osc.connect(g);
      g.connect(filter);
      osc.start();
      oscs.push(osc);
      gains.push(g);

      // slow drift via LFO on detune for a living, breathing pad
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.02;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 3 + i;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);
      lfo.start();
    });

    this.musicGain.gain.setTargetAtTime(this.musicOn ? 0.16 : 0, ctx.currentTime, 1.2);
    this.musicNodes = { oscs, gains, filter };
  }

  _click(freqStart, freqEnd, duration, type = 'sine', gainPeak = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gainPeak, t0 + duration * 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  _noiseBurst(duration, filterFreq = 2000, gainPeak = 0.3, type = 'lowpass') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainPeak, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.sfxGain);
    src.start();
  }

  tap() { this._click(520, 380, 0.09, 'sine', 0.25); }
  select() { this._click(660, 880, 0.12, 'triangle', 0.3); }
  open() {
    this._click(300, 900, 0.35, 'sine', 0.22);
    this._noiseBurst(0.28, 3200, 0.18, 'highpass');
  }
  bite() {
    this._noiseBurst(0.12, 1200, 0.35, 'lowpass');
    this._click(180, 90, 0.1, 'square', 0.12);
  }
  crumbs() { this._noiseBurst(0.18, 5000, 0.12, 'highpass'); }
  complete() {
    [523.25, 659.25, 783.99].forEach((f, i) => {
      setTimeout(() => this._click(f, f, 0.5, 'sine', 0.18), i * 110);
    });
  }
}

export const audio = new ChocolateAudio();
