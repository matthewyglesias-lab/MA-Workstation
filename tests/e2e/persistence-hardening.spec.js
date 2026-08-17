const { test, expect } = require('@playwright/test');
const { fillDate } = require('./date-entry');

const workflowLabels = {
  administer: 'Injection'
};

async function openWorkflow(page, workflow) {
  const shell = page.locator('.cd2004-shell');
  const navButton = page.locator(
    `.cd2004-nav-item[title="${workflowLabels[workflow]}"]`
  );
  await navButton.click();
  await expect(shell).toHaveAttribute('data-active-workflow', workflow);
  // Injection is migrated to a real panel; #panel-administer stays loaded
  // hidden as a print/readiness compatibility mirror only.
  await expect(page.locator('.wfp-panel')).toBeVisible();
}

async function openInjectionTab(page, tabName) {
  const panel = page.locator('.wfp-panel');
  const currentLabel = {
    Order: 'Order & Timing',
    Schedule: 'Order & Timing',
    Verification: 'Administration',
    Outcome: 'Review'
  }[tabName] ?? tabName;
  await panel.getByRole('tab', { name: currentLabel, exact: true }).click();
  return panel;
}

const malformedInjectionRecords = [
  {
    name: 'malformed JSON',
    value: '{bad json',
    expectedDetail: /malformed JSON/i
  },
  {
    name: 'non-array JSON',
    value: JSON.stringify({ records: [] }),
    expectedDetail: /expected list format/i
  },
  {
    name: 'array containing an invalid record',
    value: JSON.stringify([
      {
        id: '',
        type: 'injection',
        status: 'draft',
        patient: { name: 'Do not overwrite' }
      }
    ]),
    expectedDetail: /invalid entry/i
  }
];

for (const fixture of malformedInjectionRecords) {
  test(`autosave leaves ${fixture.name} injection-record storage byte-for-byte unchanged`, async ({
    page
  }) => {
    const key = 'ipmgMedAssistInjectionRecordsV1';
    await page.addInitScript(({ storageKey, value }) => {
      localStorage.setItem(storageKey, value);
    }, { storageKey: key, value: fixture.value });

    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill(`QA, ${fixture.name}`);

    await expect(page.locator('#injRecordStatus')).toHaveText('Save failed');
    await expect(page.locator('#injRecordWorkspace .inj-record-status')).toHaveText(
      fixture.expectedDetail
    );
    await expect.poll(() =>
      page.evaluate(storageKey => localStorage.getItem(storageKey), key)
    ).toBe(fixture.value);
    await expect(page.locator('#ptName')).toHaveValue(`QA, ${fixture.name}`);
    await expect(page.locator('#panel-administer')).not.toHaveClass(
      /record-readonly/
    );
  });
}

test('non-administration handoff does not expose an early injection closeout path', async ({
  page
}) => {
  await page.goto('/');
  await openWorkflow(page, 'administer');
  let panel = await openInjectionTab(page, 'Order');
  await panel.locator('input[placeholder="Last, First"]').fill('QA, Handoff Rollback');

  panel = await openInjectionTab(page, 'Order');
  await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Other' });

  panel = await openInjectionTab(page, 'Outcome');
  await panel.getByText('Held', { exact: true }).click();
  await panel.locator('.wfp-field:has-text("Provider / recipient") input').fill('QA Provider, MD');
  await fillDate(panel.locator('.wfp-field:has-text("Contact / decision time") input'), '2026-07-30T10:15');
  await panel.locator('.wfp-field:has-text("Direction / outcome") textarea').fill(
    'Hold medication; provider will reassess before any administration.'
  );
  await expect(page.locator('#clinicalDispositionBadge')).toHaveText(
    'Handoff complete'
  );

  // Injection closeout has one owner: the explicit local attestation action
  // in the lifecycle strip, which remains unavailable until every required
  // administration condition is complete. A non-admin handoff cannot claim
  // completion through the retired daily-activity path.
  await expect(
    panel.getByRole('button', { name: 'Add to daily activity', exact: true })
  ).toHaveCount(0);
  await expect(
    page.locator('[data-injection-record-actions] [data-injection-finish]')
  ).toBeDisabled();
  await expect(page.locator('.cd2004-shell')).toHaveAttribute(
    'data-active-workflow',
    'administer'
  );
  await expect(page.locator('#ptName')).toHaveValue('QA, Handoff Rollback');
  await expect(page.locator('#clinicalDispositionBadge')).toHaveText(
    'Handoff complete'
  );
});
