import { describe, expect, it } from 'vitest';
import { sourcePresentation } from './source-presentation';

describe('sourcePresentation', () => {
  it('gives Openverse and Commons explicit user-facing labels and tones', () => {
    expect(sourcePresentation('openverse')).toEqual({
      label: 'Openverse',
      tone: 'bg-violet-600/90 text-white',
    });
    expect(sourcePresentation('wikimedia')).toEqual({
      label: 'Commons',
      tone: 'bg-cyan-700/90 text-white',
    });
  });
});
