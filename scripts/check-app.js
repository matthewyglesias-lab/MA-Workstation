'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'index.html');
const configPath = path.join(root, 'staticwebapp.config.json');

assert.ok(fs.existsSync(appPath), 'index.html is missing');
JSON.parse(fs.readFileSync(configPath, 'utf8'));

const html = fs.readFileSync(appPath, 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
assert.ok(scripts.length > 0, 'No inline scripts found');
scripts.forEach((script, index) => {
  new vm.Script(script, { filename: `index.html:inline-script-${index + 1}` });
});

const sampleSheetRenderers = (html.match(/window\.renderSampleSheet\s*=\s*function\b/g) || []).length;
assert.equal(sampleSheetRenderers, 1, 'Expected exactly one final sample-sheet renderer');

function section(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Could not locate ${startMarker}`);
  return html.slice(start, end);
}

function json(value) {
  return JSON.parse(JSON.stringify(value));
}

const scheduling = section('const MEDS = [', 'const REASONS=[');
const model = vm.runInNewContext(
  `(() => {${scheduling}\nreturn { MEDS, effectiveWindow, medDosesForInterval }; })()`,
  Object.create(null),
  { filename: 'index.html:scheduling' }
);
const medication = key => {
  const result = model.MEDS.find(med => med.key === key);
  assert.ok(result, `Missing ${key} medication definition`);
  return result;
};

const aristada = medication('aristada');
assert.deepEqual(json(model.medDosesForInterval(aristada, 'q4wk')), ['441 mg', '662 mg', '882 mg']);
assert.deepEqual(json(model.medDosesForInterval(aristada, 'q6wk')), ['882 mg']);
assert.deepEqual(json(model.medDosesForInterval(aristada, 'q8wk')), ['1064 mg']);
assert.deepEqual(json(model.effectiveWindow(aristada, 'q6wk')), { winB: 14, winA: 14 });
assert.deepEqual(json(model.effectiveWindow(aristada, 'q8wk')), { winB: 14, winA: 14 });
assert.deepEqual(json(model.effectiveWindow(medication('hafyera'), 'q26wk')), { winB: 14, winA: 21 });
assert.deepEqual(json(model.effectiveWindow(medication('maintena'), 'q4wk')), { winB: 2, winA: 7 });

const staffStorage = new Map([['ipmgStaffName', 'Legacy Staff']]);
const staffContext = {
  SAFE_STORAGE: {
    get: (key, fallback = '') => staffStorage.has(key) ? staffStorage.get(key) : fallback,
    set: (key, value) => staffStorage.set(key, String(value)),
    remove: key => staffStorage.delete(key)
  }
};
const staffCode = section("const STAFF_STORAGE_KEY='ipmgMedAssistStaff';", 'function loadLog()');
const getStoredStaff = vm.runInNewContext(
  `(() => {${staffCode}\nreturn getStoredStaff; })()`,
  staffContext,
  { filename: 'index.html:staff-storage' }
);
assert.equal(getStoredStaff(), 'Legacy Staff');
assert.equal(staffStorage.get('ipmgMedAssistStaff'), 'Legacy Staff');
assert.equal(staffStorage.has('ipmgStaffName'), false);

const csvEscape = vm.runInNewContext(
  `(() => {${section('function csvEscape(', 'function exportDailyCsv')}\nreturn csvEscape; })()`,
  Object.create(null),
  { filename: 'index.html:csv-export' }
);
assert.equal(csvEscape('=1+1'), "'=1+1");
assert.equal(csvEscape('+1'), "'+1");
assert.equal(csvEscape('-1'), "'-1");
assert.equal(csvEscape('@SUM(A1:A2)'), "'@SUM(A1:A2)");
assert.equal(csvEscape('\t=1+1'), '"\'\t=1+1"');
assert.equal(csvEscape('patient, name'), '"patient, name"');
assert.equal(csvEscape('say "hi"'), '"say ""hi"""');

console.log(`Static app checks passed (${scripts.length} inline scripts, ${sampleSheetRenderers} sample-sheet renderer).`);
