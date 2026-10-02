import { describe, it, expect } from 'vitest';
import { worklistDate } from '../../src/presentation/lightfully/worklist-display';
describe('worklist date display', () => {
 it('formats an exact recorded calendar date', () => expect(worklistDate('2026-09-17')).toBe('Sep 17, 2026'));
 it('accepts a real leap day', () => expect(worklistDate('2024-02-29')).toBe('Feb 29, 2024'));
 it.each([null, undefined, '', 'IM', 'No administration site', '2026-02-30', '2026-13-01', '09/17/2026'])('does not fabricate a date from %s', value => expect(worklistDate(value)).toBe(''));
});
