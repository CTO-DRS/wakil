// Copyright (c) 2026 DRS AI. All rights reserved.
import { appendEvent, modelBuildLabel, MODEL_HISTORY_CAP, useModelHistoryStore, type ModelEvent } from '../src/store/modelHistoryStore';

const event = (overrides: Partial<ModelEvent>): ModelEvent => ({
  id: 'e1',
  modelId: 'm1',
  modelName: 'Qwen2.5 0.5B Instruct',
  kind: 'download',
  build: '0.5B · Q4_K_M',
  sizeBytes: 491400032,
  at: 1_000,
  ...overrides,
});

describe('appendEvent', () => {
  const cases: { name: string; events: ModelEvent[]; added: ModelEvent; cap?: number; expectedIds: string[] }[] = [
    { name: 'empty log gains the event', events: [], added: event({ id: 'a' }), expectedIds: ['a'] },
    {
      name: 'newest event lands first',
      events: [event({ id: 'old', at: 1 })],
      added: event({ id: 'new', at: 2 }),
      expectedIds: ['new', 'old'],
    },
    {
      name: 'cap trims the oldest tail',
      events: [event({ id: 'e1' }), event({ id: 'e2' }), event({ id: 'e3' })],
      added: event({ id: 'e4' }),
      cap: 3,
      expectedIds: ['e4', 'e1', 'e2'],
    },
  ];

  it.each(cases)('$name', ({ events, added, cap, expectedIds }) => {
    expect(appendEvent(events, added, cap).map((e) => e.id)).toEqual(expectedIds);
  });

  it('keeps the default cap bounded and drops the oldest', () => {
    let events: ModelEvent[] = [];
    for (let i = 0; i < MODEL_HISTORY_CAP + 25; i++) events = appendEvent(events, event({ id: `e${i}`, at: i }));
    expect(events).toHaveLength(MODEL_HISTORY_CAP);
    expect(events[0]!.id).toBe(`e${MODEL_HISTORY_CAP + 24}`);
    expect(events[MODEL_HISTORY_CAP - 1]!.id).toBe('e25');
  });
});

describe('modelBuildLabel', () => {
  it.each([
    { name: 'params and quant', params: '0.5B', quant: 'Q4_K_M', expected: '0.5B · Q4_K_M' },
    { name: 'params only', params: '39M', quant: '', expected: '39M' },
    { name: 'quant only', params: '', quant: 'F16', expected: 'F16' },
    { name: 'nothing known', params: '', quant: '', expected: '' },
  ])('$name', ({ params, quant, expected }) => {
    expect(modelBuildLabel({ params, quant })).toBe(expected);
  });
});

describe('modelHistoryStore', () => {
  beforeEach(() => {
    useModelHistoryStore.setState({ events: [] });
  });

  it('records events newest first with id and time', () => {
    useModelHistoryStore.getState().record({ modelId: 'm1', modelName: 'M One', kind: 'download', build: '1B', sizeBytes: 10 });
    useModelHistoryStore.getState().record({ modelId: 'm2', modelName: 'M Two', kind: 'deleted', build: '', sizeBytes: 0 });
    const events = useModelHistoryStore.getState().events;
    expect(events.map((e) => e.modelId)).toEqual(['m2', 'm1']);
    for (const e of events) {
      expect(e.id).toBeTruthy();
      expect(e.at).toBeGreaterThan(0);
    }
    expect(events[0]).toMatchObject({ kind: 'deleted', modelName: 'M Two' });
  });

  it('caps the persisted log at MODEL_HISTORY_CAP', () => {
    for (let i = 0; i < MODEL_HISTORY_CAP + 5; i++) {
      useModelHistoryStore.getState().record({ modelId: `m${i}`, modelName: `M${i}`, kind: 'download', build: '', sizeBytes: i });
    }
    const events = useModelHistoryStore.getState().events;
    expect(events).toHaveLength(MODEL_HISTORY_CAP);
    expect(events[0]!.modelId).toBe(`m${MODEL_HISTORY_CAP + 4}`);
  });

  it('clear wipes the log but keeps recording afterwards', () => {
    useModelHistoryStore.getState().record({ modelId: 'm1', modelName: 'M', kind: 'added', build: '', sizeBytes: 0 });
    useModelHistoryStore.getState().clear();
    expect(useModelHistoryStore.getState().events).toEqual([]);
    useModelHistoryStore.getState().record({ modelId: 'm2', modelName: 'M', kind: 'download', build: '', sizeBytes: 1 });
    expect(useModelHistoryStore.getState().events).toHaveLength(1);
  });
});
