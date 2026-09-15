import type { Actor, Lot, Movement, MovementInput } from '../../shared/contracts.js';
import { invariant } from '../platform/errors.js';

/** Whole stock units only. Dose/volume conversion is a separate, future clinical capability. */
export function evaluateMovement(input: MovementInput, lot: Lot, patientReserved: number, actor: Actor, today: string, original?: Movement, alreadyReversed = false) {
  const manager = actor.roles.includes('Inventory.Manager');
  invariant(!['adjust', 'reverse'].includes(input.kind) || manager, 'permission', 'Inventory manager access is required.', 403);
  invariant(input.lotId === lot.id, 'lot_mismatch', 'The stock lot does not match.');
  let stockDelta = 0, reservedDelta = 0;
  let patientId = input.patientId;
  if (input.kind === 'reverse') {
    invariant(original && original.lotId === lot.id && original.kind !== 'reverse', 'invalid_reversal', 'Choose an original movement from this lot.');
    invariant(!alreadyReversed, 'already_reversed', 'This movement was already reversed.');
    stockDelta = -original.stockDelta;
    reservedDelta = -original.reservedDelta;
    patientId = original.patientId;
    invariant(input.patientId === patientId, 'reversal_patient', 'A reversal must retain the original patient link.');
  } else {
    invariant(input.quantity !== 0 && (input.kind === 'adjust' || input.quantity > 0), 'quantity', 'Invalid stock quantity.', 400);
    if (['reserve', 'use'].includes(input.kind)) {
      invariant(lot.status === 'active', 'quarantine', 'This lot is quarantined.');
      invariant(lot.expiresOn >= today, 'expired', 'This lot is expired.');
    }
    switch (input.kind) {
      case 'receive': case 'adjust': stockDelta = input.quantity; break;
      case 'reserve': reservedDelta = input.quantity; break;
      case 'release': reservedDelta = -input.quantity; break;
      case 'use': stockDelta = -input.quantity; reservedDelta = -input.quantity; break;
      case 'waste': stockDelta = -input.quantity; break;
    }
  }
  if (lot.ownership === 'patient') invariant(patientId === lot.ownerPatientId, 'ownership', 'Patient-specific stock must stay linked to its owner.');
  if (reservedDelta !== 0) invariant(patientId, 'patient_required', 'Select a patient for this reservation.');
  invariant(patientReserved + reservedDelta >= 0, 'reservation', 'This patient does not have enough reserved stock.');
  const onHand = lot.onHand + stockDelta, reserved = lot.reserved + reservedDelta;
  invariant(onHand >= 0 && reserved >= 0 && onHand >= reserved, 'stock', 'Insufficient available stock. Release reservations before removing allocated stock.');
  invariant(onHand <= 2147483647 && reserved <= 2147483647, 'capacity', 'Stock quantity exceeds the supported range.');
  return { stockDelta, reservedDelta, patientId, onHand, reserved };
}
