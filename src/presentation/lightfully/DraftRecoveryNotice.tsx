import type { RecoveryStatus } from '../../persistence/workflow-recovery';

export function DraftRecoveryNotice({ status }: { status?: RecoveryStatus }) {
  const error = status === 'error';
  const saved = status === 'saved' || status === 'recovered';
  return <div class={`lf-recovery-notice${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>
    <strong>{error ? 'Reload recovery unavailable' : status === 'recovered' ? 'Unfinished work restored' : saved ? 'Draft retained for this tab' : 'Unfinished work'}</strong>
    <span>{error
      ? 'Keep this tab open. Recovery could not be verified; copy your current work before reloading or closing.'
      : 'Work is retained when you change services or reload. Closing this tab ends the session; copy and verify the documentation in Tebra first.'}</span>
  </div>;
}
