/** Small presentation-only policies. They never read or write encounter data. */
export function nextEnabledCommand(
  commands: readonly { disabled?: boolean }[], current: number,
  direction: 1 | -1,
): number {
  if (!commands.length) return -1;
  const start = current < 0 && direction === -1 ? commands.length : current;
  for (let step = 1; step <= commands.length; step++) {
    const index = ((start + direction * step) % commands.length + commands.length) % commands.length;
    if (!commands[index]?.disabled) return index;
  }
  return -1;
}

/** Synchronous guard: React/Preact state alone does not block same-tick clicks. */
export function createActionGate() {
  let pending = false;
  return {
    get pending() { return pending; },
    enter() { if (pending) return false; pending = true; return true; },
    release() { pending = false; },
  };
}

export function outsideRect(point: { clientX: number; clientY: number },
  rect: { left: number; right: number; top: number; bottom: number }): boolean {
  return point.clientX < rect.left || point.clientX > rect.right ||
    point.clientY < rect.top || point.clientY > rect.bottom;
}
