import type { RecoveryStatus } from '../../persistence/workflow-recovery';

export function DraftRecoveryNotice({ status }: { status?: RecoveryStatus }) {
  const error = status === 'error';
  const saved = status === 'saved' || status === 'recovered';
  return <div class={`lf-recovery-notice${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>
    <strong>{error ? 'Reload recovery unavailable' : status === 'recovered' ? 'Unfinished work restored' : saved ? 'Draft retained for this tab' : 'Unfinished work'}</strong>
    <span>{error
      ? 'Keep this tab open. Copy your work before reloading or closing; existing recovery data was left unchanged.'
      : 'You can change services or reload this tab. Finish and verify the documentation in Tebra before closing the tab.'}</span>
  </div>;
}
