import type { Activity, ActivityUpdate } from '../../shared/contracts.js';
import { invariant } from '../platform/errors.js';
export function validateActivityUpdate(current: Activity, next: ActivityUpdate) {
  invariant(current.version === next.expectedVersion, 'version_conflict', 'Another staff member updated this activity. Refresh before saving.');
  const order = { planned: 0, in_progress: 1, completed: 2 };
  invariant(order[next.status] >= order[current.status], 'transition', 'Completed work cannot be silently reopened. A correction workflow is required.');
  invariant(current.handoff !== 'filed', 'filed_immutable', 'A filed handoff cannot be overwritten.');
  invariant(next.handoff !== 'filed' || (next.status === 'completed' && next.tebraReference), 'handoff', 'Complete the service and record the Tebra filing reference first.');
  invariant(next.handoff === 'filed' || next.tebraReference === null, 'reference', 'Add a filing reference only when confirming it was filed in Tebra.');
}
