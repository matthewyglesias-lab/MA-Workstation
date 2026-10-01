import { describe, expect, it } from 'vitest';
import { createActionGate, nextEnabledCommand, outsideRect } from '../../src/presentation/lightfully/interaction-policy';
describe('local presentation interaction policies', () => {
  const commands = [{ disabled: true }, {}, { disabled: true }, {}];
  it.each([
    [-1, 1, 1], [1, 1, 3], [3, 1, 1], [1, -1, 3],
    [3, -1, 1], [4, -1, 3], [-1, -1, 3],
  ] as const)('selects enabled commands from %s in direction %s', (from, direction, expected) => {
    expect(nextEnabledCommand(commands, from, direction)).toBe(expected);
  });
  it('does not select an unavailable or absent command', () => {
    expect(nextEnabledCommand([], -1, 1)).toBe(-1);
    expect(nextEnabledCommand([{ disabled: true }], 0, 1)).toBe(-1);
  });
  it('guards same-tick activation and permits an explicit retry', () => {
    const gate = createActionGate();
    expect(gate.pending).toBe(false);
    expect(gate.enter()).toBe(true);
    expect(gate.pending).toBe(true);
    expect(gate.enter()).toBe(false);
    gate.release();
    expect(gate.pending).toBe(false);
    expect(gate.enter()).toBe(true);
  });
  it('does not share activation state between components', () => {
    const first = createActionGate(), second = createActionGate();
    first.enter(); expect(second.enter()).toBe(true);
    first.release(); expect(second.pending).toBe(true);
  });
  const rect = { left: 10, right: 100, top: 20, bottom: 200 };
  it.each([[10,20],[55,110],[100,200]])('does not dismiss inside or at the surface boundary (%s,%s)', (clientX,clientY) => {
    expect(outsideRect({clientX,clientY},rect)).toBe(false);
  });
  it.each([[9,20],[101,110],[55,19],[55,201]])('recognizes the actual backdrop (%s,%s)', (clientX,clientY) => {
    expect(outsideRect({clientX,clientY},rect)).toBe(true);
  });
});
