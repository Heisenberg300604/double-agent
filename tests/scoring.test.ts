import { describe, expect, it } from 'vitest';
import { killPoints, killRelation, ordinal, rankOf } from '../src/sim/scoring';

describe('scoring rules', () => {
  it('target kill: +100, +50 unseen, +25 headshot', () => {
    expect(killPoints('target', false, false)).toBe(100);
    expect(killPoints('target', false, true)).toBe(150);
    expect(killPoints('target', true, false)).toBe(125);
    expect(killPoints('target', true, true)).toBe(175);
  });

  it('hunter +50, other spy −25, civilian −50 (no bonuses)', () => {
    expect(killPoints('hunter', true, true)).toBe(50);
    expect(killPoints('other', true, true)).toBe(-25);
    expect(killPoints('civilian', true, false)).toBe(-50);
  });

  it('classifies relations from the chain before the kill', () => {
    // killer 1 targets 2; 3 targets 1.
    expect(killRelation(2, 3, 1, 2, true)).toBe('target');
    expect(killRelation(2, 1, 1, 3, true)).toBe('hunter');
    expect(killRelation(2, 5, 1, 4, true)).toBe('other');
    expect(killRelation(2, -1, 1, 40, false)).toBe('civilian');
  });

  it('ranks by score with ties sharing a rank', () => {
    const e = [{ id: 0, score: 100 }, { id: 1, score: 250 }, { id: 2, score: 100 }, { id: 3, score: -25 }];
    expect(rankOf(e, 1)).toBe(1);
    expect(rankOf(e, 0)).toBe(2);
    expect(rankOf(e, 2)).toBe(2);
    expect(rankOf(e, 3)).toBe(4);
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(8)).toBe('8th');
    expect(ordinal(11)).toBe('11th');
  });
});
