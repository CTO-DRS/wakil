// Copyright (c) 2026 DRS AI. All rights reserved.
import { planAckForSpeech } from '../src/store/agentStore';

describe('planAckForSpeech — the sentence the user hears with the plan card', () => {
  const steps = [{ title: 'أنشئ المذكرة' }, { title: 'أضبط التذكير' }];

  it('arabic: names the step count, the first step, and the confirmation promise', () => {
    const ack = planAckForSpeech(steps, 'ar');
    expect(ack).toContain('خطوات');
    expect(ack).toContain('أنشئ المذكرة');
    expect(ack).toContain('توقف قبلها'); // nothing changes data without approval
    expect(ack.endsWith('.')).toBe(true); // a clean sentence boundary for the streamer
  });

  it('arabic: a single step reads naturally (no plural)', () => {
    const ack = planAckForSpeech([steps[0]!], 'ar');
    expect(ack).toContain('خطوة واحدة');
    expect(ack).not.toContain('خطوات');
    expect(ack).toContain('أنشئ المذكرة');
  });

  it('english mirrors the same three pieces', () => {
    const ack = planAckForSpeech(steps, 'en');
    expect(ack).toContain('2 steps');
    expect(ack).toContain('أنشئ المذكرة'); // the step title is the agent's own words
    expect(ack).toContain('confirmation');
  });

  it('an empty plan still answers out loud', () => {
    expect(planAckForSpeech([], 'ar')).toBe('حاضر، شغّال على طلبك.');
    expect(planAckForSpeech([], 'en')).toBe('On it.');
  });

  it('is one short first sentence — the <3 s budget is measured against it', () => {
    const ack = planAckForSpeech(steps, 'ar');
    expect(ack.length).toBeLessThan(140);
    // The first terminator arrives well before the whole string ends.
    const firstCut = ack.indexOf('.');
    expect(firstCut).toBeGreaterThan(0);
    expect(firstCut).toBeLessThan(ack.length - 1);
  });
});
