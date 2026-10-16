
import { Point } from './types';

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private enabled: boolean = true;
  private listenerPos: Point = { x: 0, y: 0 };
  private readonly MAX_DISTANCE = 1500;

  constructor() {
    // We'll initialize on first user interaction to comply with browser policies
  }

  setListenerPosition(pos: Point) {
    this.listenerPos = pos;
  }

  private getDistanceVolume(sourcePos?: Point): number {
    if (!sourcePos) return 1.0;
    const dx = sourcePos.x - this.listenerPos.x;
    const dy = sourcePos.y - this.listenerPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > this.MAX_DISTANCE) return 0;
    // Linear rolloff
    return 1 - (distance / this.MAX_DISTANCE);
  }

  private init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = 0.3; // Global volume
    } catch (e) {
      console.error("AudioContext not supported", e);
    }
  }

  setVolume(volume: number) {
    this.init();
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number, decay: boolean = true, sourcePos?: Point) {
    if (!this.enabled) return;
    
    const distanceVol = this.getDistanceVolume(sourcePos);
    if (distanceVol <= 0) return;

    this.init();
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    
    gain.gain.setValueAtTime(volume * distanceVol, this.ctx.currentTime);
    if (decay) {
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    }

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playShoot(pos?: Point) {
    this.playTone(150, 'square', 0.1, 0.2, true, pos);
    this.playTone(100, 'sawtooth', 0.15, 0.1, true, pos);
  }

  playExplosion(pos?: Point) {
    const distanceVol = this.getDistanceVolume(pos);
    if (distanceVol <= 0) return;

    this.playTone(60, 'sawtooth', 0.5, 0.4, true, pos);
    this.playTone(40, 'square', 0.4, 0.3, true, pos);
    // Add some noise-like effect
    if (this.ctx && this.masterGain) {
      const bufferSize = this.ctx.sampleRate * 0.5;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.3 * distanceVol, this.ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
      noise.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start();
    }
  }

  playImpact(pos?: Point) {
    this.playTone(200, 'sine', 0.05, 0.1, true, pos);
  }

  playCollect(pos?: Point) {
    this.playTone(440, 'sine', 0.1, 0.2, true, pos);
    setTimeout(() => this.playTone(880, 'sine', 0.1, 0.2, true, pos), 50);
  }

  playPowerUp(pos?: Point) {
    this.playTone(523.25, 'sine', 0.1, 0.2, true, pos); // C5
    setTimeout(() => this.playTone(659.25, 'sine', 0.1, 0.2, true, pos), 100); // E5
    setTimeout(() => this.playTone(783.99, 'sine', 0.2, 0.2, true, pos), 200); // G5
  }

  playAbility(type: string, pos?: Point) {
    if (type === 'SCOUT') {
      this.playTone(800, 'sine', 0.3, 0.2, true, pos);
      setTimeout(() => this.playTone(1200, 'sine', 0.2, 0.1, true, pos), 100);
    } else if (type === 'HEAVY') {
      this.playTone(100, 'sawtooth', 0.4, 0.3, true, pos);
      this.playTone(60, 'square', 0.4, 0.2, true, pos);
    } else if (type === 'ARTILLERY') {
      this.playTone(200, 'square', 0.5, 0.3, true, pos);
      this.playTone(150, 'sawtooth', 0.5, 0.2, true, pos);
    } else if (type === 'FOLLOWER') {
      this.playTone(600, 'sine', 0.2, 0.2, true, pos);
      setTimeout(() => this.playTone(400, 'sine', 0.2, 0.2, true, pos), 100);
    } else if (type === 'BOUNCER') {
      this.playTone(400, 'square', 0.1, 0.2, true, pos);
      setTimeout(() => this.playTone(500, 'square', 0.1, 0.2, true, pos), 50);
      setTimeout(() => this.playTone(600, 'square', 0.1, 0.2, true, pos), 100);
    }
  }

  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;

  playEngine(speed: number) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;

    if (speed > 0.1) {
      if (!this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.setValueAtTime(50, this.ctx.currentTime);
        this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.engineOsc.connect(this.engineGain);
        this.engineGain.connect(this.masterGain);
        this.engineOsc.start();
      }
      
      const targetFreq = 50 + speed * 15;
      const targetVol = Math.min(0.05, speed * 0.01);
      
      this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
      this.engineGain!.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);
    } else if (this.engineGain) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
  }
}

export const soundManager = new SoundManager();
