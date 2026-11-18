// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Download speed over a sliding time window. Samples are (bytes so far, time); the
 * speed is the byte delta across the window, so bursts and stalls smooth out.
 */
export class SpeedMeter {
  private samples: { bytes: number; t: number }[] = [];

  constructor(private readonly windowMs = 3000) {}

  reset(): void {
    this.samples = [];
  }

  /** Adds a sample and returns the current speed in bytes per second (0 until known). */
  sample(bytes: number, t: number): number {
    const last = this.samples[this.samples.length - 1];
    if (last && bytes < last.bytes) this.samples = []; // restarted from scratch
    this.samples.push({ bytes, t });
    while (this.samples.length > 2 && t - this.samples[1].t >= this.windowMs) this.samples.shift();
    return this.speed();
  }

  speed(): number {
    if (this.samples.length < 2) return 0;
    const a = this.samples[0];
    const b = this.samples[this.samples.length - 1];
    const dt = b.t - a.t;
    if (dt <= 0) return 0;
    return Math.max(0, ((b.bytes - a.bytes) * 1000) / dt);
  }
}

/** Seconds left at the given speed, or null when it cannot be estimated. */
export function etaSeconds(written: number, total: number, bytesPerSec: number): number | null {
  if (!(total > 0) || !(bytesPerSec > 0)) return null;
  const left = Math.max(0, total - written);
  return Math.ceil(left / bytesPerSec);
}

/** Speed split for display: decimal MB/s (one decimal under 100) or KB/s. */
export function speedParts(bytesPerSec: number): { unit: 'MB' | 'KB'; value: string } {
  if (!(bytesPerSec > 0)) return { unit: 'KB', value: '0' };
  if (bytesPerSec >= 1e6) return { unit: 'MB', value: (bytesPerSec / 1e6).toFixed(bytesPerSec >= 1e8 ? 0 : 1) };
  return { unit: 'KB', value: String(Math.max(1, Math.round(bytesPerSec / 1e3))) };
}

/** Duration split for display: hours+minutes, minutes+seconds, or seconds. */
export function etaParts(totalSeconds: number): { h: number; m: number; s: number; kind: 'h' | 'm' | 's' } {
  const t = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return { h, m, s, kind: h > 0 ? 'h' : m > 0 ? 'm' : 's' };
}
