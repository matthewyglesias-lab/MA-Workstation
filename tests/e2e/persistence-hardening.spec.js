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
  await expect(page.locator(`#panel-${workflow}`)).toBeVisible();
}

async function openInjectionCard(page, cardClass) {
  const card = page.locator(`#panel-administer .${cardClass}`);
  await expect(card).toBeVisible();
  const isCollapsed = () => card.evaluate(node =>
    node.classList.contains('rc530-collapsed') ||
    node.classList.contains('rc526-collapsed')
  );
  if (await isCollapsed()) {
    const receipt = card.locator(
      '.rc530-summary:visible, .rc526-summary:visible'
    ).first();
    if (await receipt.count()) await receipt.click();
    else await card.locator('.card-head').click();
  }
  await expect.poll(isCollapsed).toBe(false);
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
    await openInjectionCard(page, 'card-encounter');
    await page.locator('#ptName').fill(`QA, ${fixture.name}`);

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
  await openInjectionCard(page, 'card-encounter');
  await page.locator('#ptName').fill('QA, Handoff Rollback');

  await openInjectionCard(page, 'card-medication');
  await page.locator('#medChips').getByRole(
    'button',
    { name: 'Other', exact: true }
  ).click();

  const disposition = page.locator('#clinicalDisposition');
  await disposition.locator('[data-disposition="held"]').click();
  await page.locator('#clinicalDispositionProvider').fill('QA Provider, MD');
  await page.locator('#clinicalDispositionTime').fill('2026-07-30T10:15');
  await page.locator('#clinicalDispositionOutcome').fill(
    'Hold medication; provider will reassess before any administration.'
  );
  await expect(page.locator('#clinicalDispositionBadge')).toHaveText(
    'Handoff complete'
  );

  const logCountBefore = await page.locator('#logCount').textContent();
  await page.locator('#addLog').click();

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
