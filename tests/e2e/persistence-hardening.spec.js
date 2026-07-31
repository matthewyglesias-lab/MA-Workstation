const { test, expect } = require('@playwright/test');

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
  await panel.getByRole('tab', { name: tabName, exact: true }).click();
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
    const panel = await openInjectionTab(page, 'Encounter');
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

test('failed non-administration handoff logging rolls back and never announces success', async ({
  page
}) => {
  await page.addInitScript(() => {
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith('ipmgMedAssistActivityLog_')) {
        throw new DOMException('Activity log blocked for test', 'QuotaExceededError');
      }
      return nativeSetItem.call(this, key, value);
    };
  });

  await page.goto('/');
  await openWorkflow(page, 'administer');
  let panel = await openInjectionTab(page, 'Encounter');
  await panel.locator('input[placeholder="Last, First"]').fill('QA, Handoff Rollback');

  panel = await openInjectionTab(page, 'Medication');
  await panel.locator('.wfp-field:has-text("Drug") select').selectOption({ label: 'Other' });

  panel = await openInjectionTab(page, 'Disposition');
  await panel.getByText('Held', { exact: true }).click();
  await panel.locator('.wfp-field:has-text("Provider / recipient") input').fill('QA Provider, MD');
  await panel.locator('.wfp-field:has-text("Contact / decision time") input').fill('2026-07-30T10:15');
  await panel.locator('.wfp-field:has-text("Direction / outcome") textarea').fill(
    'Hold medication; provider will reassess before any administration.'
  );
  await expect(page.locator('#clinicalDispositionBadge')).toHaveText(
    'Handoff complete'
  );

  const logCountBefore = await page.locator('#logCount').textContent();
  await panel.getByText('Add to log', { exact: true }).click();

  await expect(page.locator('#toastMsg')).toHaveText(
    /could not be saved to the activity log/i
  );
  await expect(page.locator('#toastMsg')).not.toHaveText(
    /added to activity log/i
  );
  await expect(page.locator('#logCount')).toHaveText(logCountBefore || '0');
  await expect.poll(() => page.evaluate(() =>
    Object.keys(localStorage).filter(key =>
      key.startsWith('ipmgMedAssistActivityLog_')
    )
  )).toEqual([]);
  await expect(page.locator('.cd2004-shell')).toHaveAttribute(
    'data-active-workflow',
    'administer'
  );
  await expect(page.locator('#ptName')).toHaveValue('QA, Handoff Rollback');
  await expect(page.locator('#clinicalDispositionBadge')).toHaveText(
    'Handoff complete'
  );
});
