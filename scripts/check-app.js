'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'index.html');
const legacyMarkupPath = path.join(root, 'src', 'legacy', 'legacy-markup.html');
const legacyRuntimePath = path.join(root, 'public', 'legacy', 'legacy-runtime.js');
const legacyStylePath = path.join(root, 'public', 'legacy', 'legacy.css');
const desktopStylePath = path.join(root, 'src', 'presentation', 'clinical-desktop.css');
const panelStylePath = path.join(
  root, 'src', 'presentation', 'workflows', 'workflow-panels.css',
);
const configPath = path.join(root, 'staticwebapp.config.json');
const workflowPath = path.join(root, '.github', 'workflows', 'azure-static-web-apps.yml');
const smokePath = path.join(root, 'scripts', 'smoke-deployment.mjs');
const browserSmokePath = path.join(root, 'scripts', 'smoke-browser-deployment.mjs');

assert.ok(fs.existsSync(appPath), 'index.html is missing');
assert.ok(fs.existsSync(legacyMarkupPath), 'Legacy clinical markup is missing');
assert.ok(fs.existsSync(legacyRuntimePath), 'Legacy clinical runtime is missing');
assert.ok(fs.existsSync(legacyStylePath), 'Legacy clinical styles are missing');
assert.ok(fs.existsSync(desktopStylePath), 'Clinical desktop styles are missing');
assert.ok(fs.existsSync(panelStylePath), 'Workflow panel styles are missing');
JSON.parse(fs.readFileSync(configPath, 'utf8'));
assert.ok(fs.existsSync(workflowPath), 'Azure Static Web Apps workflow is missing');
assert.ok(fs.existsSync(smokePath), 'Azure deployment smoke script is missing');
assert.ok(fs.existsSync(browserSmokePath), 'Azure browser deployment smoke script is missing');

const shellHtml = fs.readFileSync(appPath, 'utf8');
const legacyMarkup = fs.readFileSync(legacyMarkupPath, 'utf8');
const legacyRuntime = fs.readFileSync(legacyRuntimePath, 'utf8');
const legacyStyle = fs.readFileSync(legacyStylePath, 'utf8');
const desktopStyle = fs.readFileSync(desktopStylePath, 'utf8');
const panelStyle = fs.readFileSync(panelStylePath, 'utf8');
const html = [shellHtml, legacyMarkup, legacyStyle, legacyRuntime].join('\n');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const smoke = fs.readFileSync(smokePath, 'utf8');
const browserSmoke = fs.readFileSync(browserSmokePath, 'utf8');
const scripts = [
  ...legacyRuntime.matchAll(
    /\/\* Legacy runtime block \d+: <script[^>]*> \*\/\s*([\s\S]*?)\/\* <\/script> \*\//gi,
  ),
].map(match => match[1]);
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
  `(() => {${scheduling}\nreturn { MEDS, compatibleIntervalsForDose, effectiveWindow, medDosesForInterval, preferredIntervalForDose }; })()`,
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
assert.deepEqual(json(model.medDosesForInterval(aristada, 'q2wk')), []);
assert.deepEqual(json(model.effectiveWindow(aristada, 'q6wk')), { winB: 14, winA: 14 });
assert.deepEqual(json(model.effectiveWindow(aristada, 'q8wk')), { winB: 14, winA: 14 });
assert.deepEqual(json(model.effectiveWindow(medication('hafyera'), 'q26wk')), { winB: 14, winA: 21 });
assert.deepEqual(json(model.effectiveWindow(medication('maintena'), 'q4wk')), { winB: 2, winA: 7 });
assert.equal(aristada.timingMode, 'orderVerify');
assert.equal(medication('uzedy').timingMode, 'orderVerify');
assert.equal(medication('maintena').timingMode, 'orderVerify');
assert.equal(medication('vivitrol').timingMode, 'orderVerify');
assert.match(medication('trinza').missed, /current dose-specific INVEGA TRINZA missed-dose table/i);
assert.match(medication('hafyera').missed, /current dose-specific INVEGA HAFYERA missed-dose table/i);
assert.match(medication('sustenna').missed, /current product-specific missed-dose table/i);
assert.match(medication('erzofri').missed, /current ERZOFRI missed-dose table/i);

const uzedy = medication('uzedy');
assert.deepEqual(json(model.compatibleIntervalsForDose(uzedy, '200 mg')), ['q8wk']);
assert.deepEqual(json(model.compatibleIntervalsForDose(uzedy, '250 mg')), ['q8wk']);
assert.deepEqual(json(model.compatibleIntervalsForDose(aristada, '1064 mg')), ['q8wk']);
assert.equal(model.preferredIntervalForDose(uzedy, '250 mg', 'q4wk'), 'q8wk');
assert.equal(model.preferredIntervalForDose(aristada, '882 mg', 'q6wk'), 'q6wk');
assert.match(
  legacyRuntime,
  /function renderDoses\(\)\{[\s\S]*?const doses=\(S\.med&&S\.med\.doses\)\|\|\[\];/,
  'Legacy dose picker must show all labeled strengths before autofilling the interval',
);

assert.match(html, /<input id="allergies" value="NKDA"/i, 'Allergy status must default to NKDA - staff review/edit it rather than fill a blank required field');
assert.match(html, /resp:"well", attest:\{\}/, 'Routine injection response must start as tolerated well for quick review');
assert.match(html, /ATTEST\.forEach\(a=>S\.attest\[a\.id\]=!a\.off&&a\.id!=="prior"\)/, 'Routine attestations must start selected while prior-dose tolerance requires current-review confirmation');
assert.match(html, /const UDS=\{reason:"routine",temp:"acceptable",control:"valid"/, 'UDS must start as a visible routine review screen');
assert.match(html, /function applyUdsDeviceProfile\(\)/, 'UDS must reconcile panel state to the physical cup/device');
assert.match(html, /else UDS_PANELS\.forEach\(panel=>\{UDS\.results\[panel\]='nt';\}\);/, 'UDS must stay a draft with panels not tested until a physical cup is selected');
assert.match(html, /readingsVerified:false/, 'UDS cup-profile state must begin with readings unverified');
assert.match(html, /id='udsReadingsVerified'/, 'Named UDS cups must require a compact physical-reading confirmation');
assert.match(html, /issues\.push\(\.\.\.udsReadingVerificationIssues\(\)\);/, 'UDS final-output gating must require the physical-reading confirmation');
assert.match(html, /monthExpired\(val\('udsExp'\),val\('udsDateTime'\)\)/, 'Expired UDS cups must block finalized output against the documented collection date');
assert.match(html, /<select id="udsValidity"><option value="acceptable">Acceptable<\/option>/, 'UDS validity must start at the routine review value');
assert.match(html, /<select id="udsConsistent"><option value="no unexpected">No unexpected findings noted by staff<\/option>/, 'UDS alignment must start at the routine review value');
assert.match(html, /<select id="sampleMedCheck"><option>Prescriber reviewed \/ ok to dispense<\/option>/, 'Sample medication review must start selected for quick review');
assert.match(html, /<select id="sampleEdu"><option>Reviewed with patient<\/option>/, 'Sample education must start selected for quick review');
assert.match(html, /<script id="rc537FastReviewScript">/, 'Expected visible fast review-by-exception controls');
assert.match(html, /Quick review — routine injection checks are preselected\./, 'Injection workflow must explain review-by-exception');
assert.match(html, /Verified NKDA\?<\/span><button type="button">Enter NKDA<\/button>/, 'A quick action to (re-)enter NKDA must remain available for records where the default was cleared or changed');
assert.match(html, /window\.IPMG_FAST_REVIEW&&st\.ok&&!st\.block&&!st\.review/, 'Routine workflow cards must auto-confirm once their fields are complete');
assert.match(html, /id="udsUsePatient"/, 'UDS must support fast current-patient transfer');
assert.match(html, /id="udsUseStaff"/, 'UDS must support fast signed-in-staff transfer');
assert.match(html, /const profileIssues=typeof window\.ipmgUdsPanelProfileIssues===\"function\"\?window\.ipmgUdsPanelProfileIssues\(\):\[\];/, 'UDS activity status must consider the selected cup panel profile');
assert.match(html, /const additionalIssues=typeof window\.ipmgUdsAdditionalOutputIssues===\"function\"\?window\.ipmgUdsAdditionalOutputIssues\(\):\[\];/, 'UDS activity status must include extra finalization guardrails');
assert.match(html, /if\(!\$\("udsPtName"\)\.value\.trim\(\)\|\|!\$\("udsDOB"\)\.value\.trim\(\)\|\|!\$\("udsDateTime"\)\.value\|\|!\$\("udsDevice"\)\.value\|\|trace\.length\|\|profileIssues\.length/, 'Incomplete UDS traceability must log as needs review, not completed');
assert.match(html, /window\.ipmgUdsFinalizationIssues=udsOutputIssues/, 'The final UDS report gate must be available to the guided workflow');
assert.match(html, /const finalizationIssues=udsFinalizationIssues\(\);/, 'The guided UDS output card must use the same finalization guardrails as the report buttons');
assert.match(html, /Confirm the physical cup and displayed panel readings before finalizing the UDS packet\./, 'The guided UDS output card must explain an unverified named cup');
assert.match(html, /Use an in-date cup before finalizing the UDS packet\./, 'The guided UDS output card must explain an expired cup');
assert.match(html, /level:hardStop\?'needs'/, 'A report-blocking UDS finalization issue must be a guided workflow block');
assert.match(html, /id==='output'\?\(st\.block\?st\.label/, 'Guided output status must not display Ready when finalization is blocked');
assert.match(html, /label:'Final output'/, 'UDS packet readiness must include the final-output gate');
assert.doesNotMatch(html, /UDS traceability incomplete \(\$\{traceIssues\.join\(/, 'UDS logging must not add a redundant confirmation dialog');
assert.match(html, /<script id="rc535ClinicalSafetyScript">/, 'Expected the clinical disposition safety gate');
assert.match(html, /No injection administration is documented/, 'Incomplete encounters must produce a neutral handoff');
assert.match(html, /if\(S\.attest&&S\.attest\.allergy&&!text\('allergies'\)\)stops\.push/, 'Blank allergy status must still block injection finalization');
assert.match(html, /Safety handoff added to activity log as Needs review\./, 'Non-administration dispositions must log as needs review');
assert.match(html, /<script id="rc536SampleSafetyScript">/, 'Expected the sample documentation safety gate');
assert.match(html, /No medication sample dispensing is documented by this draft\./, 'Incomplete sample documentation must remain a neutral draft');
assert.match(html, /\['lybalvi','cobenfy','fanapt','rexulti'\]\.includes\(m\.key\)/, 'High-risk sample products must require documented prescriber review');
assert.match(html, /el\.disabled=!ok;el\.setAttribute\('aria-disabled',String\(!ok\)\)/, 'Incomplete sample documentation must disable dispense outputs');
assert.doesNotMatch(html, /Clear to proceed — vitals not indicated or captured\./, 'Safety review must not imply authorization to administer');
assert.match(html, /<script id="rc542SampleTraceabilityScript">/, 'Expected package-level sample traceability behavior');
assert.match(html, /id="samplePackageTraceability"/, 'Samples must expose a package traceability workspace');
assert.match(html, /id="samplePackageTraceList"/, 'Added sample packages must have distinct trace rows');
assert.match(html, /function samplePackageTraceEntries\(\)/, 'Samples must build a package-level trace model');
assert.match(html, /data-sample-package-trace/, 'Added sample package traces need stable row identities');
assert.match(html, /final dispense review confirmation/, 'Sample outputs must require an explicit final review');
assert.match(html, /review\.fingerprint===reviewFingerprint\(\)/, 'The reviewed-today confirmation must become stale when the entry changes');
assert.match(html, /Package trace manifest/, 'The sample note must carry the package trace manifest');
assert.match(html, /window\.samplePackageTraceText==='function'/, 'Sample log deduplication must include package-level traceability');
assert.match(workflow, /browser_and_print_e2e:/, 'Azure deployment must include browser and print end-to-end tests');
assert.match(workflow, /needs: \[static_checks, browser_and_print_e2e\]/, 'Azure deployment must wait for browser and print end-to-end tests');
assert.match(workflow, /needs: static_checks[\s\S]*actions\/download-artifact@v4[\s\S]*run: npm run test:e2e:artifact/, 'Browser tests must exercise the exact uploaded production artifact');
assert.match(workflow, /id: deploy[\s\S]*steps\.deploy\.outputs\.static_web_app_url[\s\S]*node scripts\/smoke-deployment\.mjs/, 'Azure preview and production deployments must run the smoke check');
assert.match(workflow, /npx playwright install --with-deps chromium[\s\S]*id: deploy[\s\S]*npm run smoke:browser/, 'Azure preview and production deployments must run the deployed app in Chromium');
assert.match(smoke, /legacy\/legacy-runtime\.js/, 'Deployment smoke must verify the compatibility runtime');
assert.match(browserSmoke, /body\[data-application-ready="true"\]/, 'Browser deployment smoke must wait for application readiness');
assert.match(browserSmoke, /data-active-workflow="administer"/, 'Browser deployment smoke must open the Injection workflow');
assert.match(browserSmoke, /width: 390/, 'Browser deployment smoke must exercise the protected narrow viewport');
assert.match(browserSmoke, /meditech-workstation-gate/, 'Browser deployment smoke must verify the unsupported-viewport gate');
assert.match(browserSmoke, /getAttribute\("inert"\)/, 'Browser deployment smoke must verify hidden chart content is inert');
assert.match(browserSmoke, /documentScrollWidth/, 'Browser deployment smoke must reject horizontal page overflow');

assert.match(html, /function localDateValue\(d=new Date\(\)\)/, 'Date defaults must use the local calendar date');
assert.doesNotMatch(html, /new Date\(\)\.toISOString\(\)\.slice\(0,10\)/, 'Local date defaults must not drift through UTC conversion');
assert.match(html, /document\.createElement\("button"\)/, 'Interactive chips must be real buttons');
assert.match(html, /<script id="rc538PremiumPolishScript">/, 'Expected RC5.38 premium quick-review polish');
assert.match(html, /<script id="rc538RecordLifecycleScript">/, 'Expected local injection record lifecycle');
assert.match(html, /const storageKey='ipmgMedAssistInjectionRecordsV1'/, 'Injection drafts and completed snapshots must persist locally');
assert.match(html, /function mergePreservingUnknown\(previous,next\)/, 'Injection persistence must recursively preserve unknown historical fields');
assert.match(html, /snapshot=captureSnapshot\(existing&&existing\.snapshot\)/, 'Injection v4 snapshots must merge over the existing historical snapshot');
assert.match(html, /const record=mergePreservingUnknown\(existing,patch\)/, 'Injection saves must preserve unknown nested record fields');
assert.match(html, /Complete &amp; lock/, 'Injection completion must use a deliberate lock action');
assert.match(html, /Dated addendum/, 'Completed injection records must support addenda rather than silent edits');
assert.match(html, /function showCompletion\(record\)/, 'Completed injections must show the completion experience');
assert.match(html, /window\.ipmgClinicalDispositionSnapshot=dispositionSnapshot/, 'Clinical disposition must expose a serializable snapshot');
assert.match(html, /disposition:clone\(call\(window\.ipmgClinicalDispositionSnapshot\)\|\|\{\}\)/, 'Injection drafts must retain the clinical disposition and handoff fields');
assert.match(html, /call\(window\.restoreClinicalDisposition,snap\.disposition\|\|\{\}\)/, 'Opening a saved injection must restore its clinical disposition');
assert.match(html, /\['copyAll','printAVS','injWorksheetPrint','injWorksheetBlank'\]\.includes\(control\.id\)/, 'Locked injection records must still allow safe note and print outputs');
assert.match(html, /Document the patient date of birth\./, 'Injection finalization must require patient DOB');
assert.match(html, /Confirm today\\'s acute safety screen/, 'Injection finalization must require an explicit current safety review');
assert.match(html, /<style id="rc541RecordsDrawerStyle">/, 'Expected the searchable local injection-record drawer styles');
assert.match(html, /const recordsDrawerFilters=\[\['all','All'\],\['draft','Drafts'\],\['completed','Locked'\],\['addenda','Addenda'\]\]/, 'The drawer must provide fast All, Drafts, Locked, and Addenda filters');
assert.match(html, /function drawerRecordText\(record\)/, 'The drawer must build searchable record text');
assert.match(html, /fields\.orderingProvider,fields\.injOrderPurpose,fields\.ndc,fields\.lot,fields\.adminDate,fields\.injAdminTime/, 'The drawer must search patient, context, and traceability fields as well as record summaries');
assert.match(html, /data-records-drawer-open/, 'The compact injection history must link to the full records drawer');
assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="recordsDrawerTitle"/, 'The records drawer must use modal dialog semantics');
assert.match(html, /data-records-filter/, 'The records drawer must expose interactive record filters');
assert.match(html, /function openDrawerRecord\(id\)/, 'The drawer must reopen an existing injection record through the record lifecycle');
assert.match(html, /function flushDraft\(updateUi=true\)/, 'Record transitions must synchronously flush an in-progress injection draft');
assert.match(html, /function openRecord\(id\)\{[\s\S]{0,300}if\(mode==='edit'&&draftNeedsPersistence\(\)&&!flushDraft\(false\)\)/, 'Opening any record must flush pending injection edits and remain in place if persistence fails');
assert.match(html, /function draftNeedsPersistence\(\)\{const record=currentRecord\(\);return meaningful\(\)\|\|!!\(record&&record\.status==='draft'\);\}/, 'An existing draft must persist even after its meaningful fields are cleared');
assert.match(html, /if\(!record\)\{\s*saveFeedback='error';renderWorkspace\(\);[\s\S]{0,180}remains editable and was not locked/, 'A failed completed-record save must leave the injection editable');
assert.match(html, /set\(k,v\)\{try\{window\.localStorage\.setItem\(k,String\(v\)\);return true;\}catch\(e\)\{return false;\}\}/, 'Browser storage writes must report success or failure truthfully');
assert.match(html, /function appendLogEntry\(entry\)\{LOG\.push\(entry\);if\(saveLog\(\)\)return true;LOG\.pop\(\);return false;\}/, 'Activity-log writes must roll back when browser persistence fails');
assert.match(html, /window\.ipmgSmartVitalsSnapshot=\(\)=>\(\{version:1,recheck:!!state\.recheck\}\)/, 'Smart-vitals recheck state must be serializable');
assert.match(html, /call\(window\.restoreSmartVitalsState,snap\.smartVitals\|\|\{\}\)/, 'Opening a saved injection must restore smart-vitals state');
assert.match(html, /if\(typeof window\.resetSmartVitalsState==='function'\)window\.resetSmartVitalsState\(\)/, 'Starting a new injection must clear smart-vitals state');
assert.match(html, /const staff=val\('injAddendumAuthor'\)\|\|String\(call\(window\.getStoredStaff\)\|\|''\)\.trim\(\)/, 'A locked-record addendum must use the current addendum author');
assert.doesNotMatch(html, /const staff=val\('admin'\)\|\|String\(call\(window\.getStoredStaff\)/, 'A locked-record addendum must not inherit the original administering staff');
assert.match(html, /return patient&&birthDate\?`\$\{patient\}\|\$\{birthDate\}`:'';/, 'Site rotation history must require both patient name and DOB');
assert.match(html, /entry&&entry\.medKey===medKey&&entry\.route===route/, 'Site rotation history must stay scoped to the same medication and route');
assert.match(html, /document\.addEventListener\('keydown',handleRecordsDrawerKeys\)/, 'The drawer must install keyboard handling');
assert.match(html, /event\.key==='Escape'/, 'The drawer must close with Escape');
assert.match(html, /function refreshRecordsDrawer\(\)/, 'The record drawer must refresh after lifecycle persistence');
assert.match(html, /<script id="rc543InjectionDocumentationScript">/, 'Expected structured injection documentation behavior');
assert.match(html, /<style id="rc544ClinicalVisualConsolidationStyle">/, 'New workflow surfaces must use the consolidated clinical visual system');
assert.doesNotMatch(html, /\.chip\{appearance:none;font:inherit;\}/, 'Chip typography must not be reset globally by a late style pass');
assert.match(html, /card\.classList\.remove\('rc526-complete','rc526-collapsed','rc526-active','rc526-open'\)/, 'RC5.30 must remain the sole owner of injection-card collapse state');
assert.match(html, /window\.IPMGNavigation=\{activate,sync,focusPanel,state,reducedMotion\}/, 'Workspace modules must share one navigation, ARIA, focus, and scroll controller');
assert.doesNotMatch(html, /function activateTab\(/, 'Legacy duplicate tab activation must stay retired');
assert.match(html, /<button type="button" class="tab on" data-tab="home">/, 'Workspace tabs must use native keyboard-accessible buttons');
assert.match(html, /const encounter=q\('samplePtName'\)\?\.closest\('\.card'\)/, 'Samples must resolve its Patient guide from a unique field anchor');
assert.match(html, /new Set\(\[encounter,medCard,safety\]\)\.size!==3/, 'Samples must reject merged guided-card ownership');
assert.match(html, /root\.closest\('\.panel'\)\?\.querySelector\('\.preview-col'\)/, 'Guided output highlighting must stay inside its active workflow panel');
assert.match(html, /rootState\.openInjection=openInj/, 'The injection progress rail must route through the active collapse controller');
assert.match(html, /recordsDrawerState=\{query:'',filter:'all',lastFocus:null,closing:false\}/, 'The records drawer must distinguish its open and closing interaction states');
assert.match(html, /localDay\(review\.confirmedAt\)===localDay\(new Date\(\)\)/, 'Reviewed-today confirmation must expire on the next local calendar day');
assert.match(html, /overlay\.setAttribute\('aria-labelledby','injCompletionTitle'\)/, 'The completion dialog must expose a labelled modal contract');
assert.match(html, /event\.key==='Escape'\)\{event\.preventDefault\(\);close\(\)/, 'The completion dialog must close with Escape');
// classic-workflows.css is gone: it restyled legacy workflow markup mounted
// inside the shell, and no workflow mounts legacy markup any more - all eight
// are typed panels. The square-surface guarantee it used to encode now lives
// in the panel library, so assert it there instead of on a deleted file.
assert.match(panelStyle, /border-radius: 0 !important;/, 'Migrated workflow panels must keep the square classic-EHR surface treatment');
assert.match(desktopStyle, /\.records-drawer \{[^}]*border-radius: 0 !important;/, 'The global records drawer must use the classic-EHR treatment');
// Was `1px`. The receipt was flattened to a true square edge during the
// old-EHR polish pass - it had been the last nonzero radius left in either
// stylesheet - and this assertion was not updated with it. It went unnoticed
// because check:static only runs on pull requests against `main`.
assert.match(desktopStyle, /\.inj-completion-card \{[^}]*border-radius: 0 !important;/, 'The completion receipt must use the classic-EHR treatment');
assert.match(html, /id="injAdminTime" data-injection-field="admin-time"/, 'Injection completion must capture the actual administration time');
assert.match(html, /window\.ipmgInjectionDetailReview=detailReview/, 'Conditional injection documentation must expose a shared finalization review');
assert.match(html, /Document both the administration amount and its unit/, 'Partial structured administration details must block finalization');
assert.match(html, /Document the waste witness\./, 'Waste documentation must require its witness when selected');
assert.match(html, /Document the direction, action, and next step for the administration exception\./, 'Administration exceptions must require a complete handoff');
assert.match(html, /injExceptionToggle.*checkbox/, 'Administration exception workflow must be opt-in');
assert.match(html, /injAdminTime.*injVolume.*injExceptionOutcome/, 'Injection lifecycle snapshots must include structured documentation fields');
assert.match(html, /function appendNarrative\(out,heading,raw,indent\)/, 'Multi-line structured details must retain their visual hierarchy in the copied note');
assert.match(html, /function clearSecondAdministrationTime\(\).*function setProtocol\(id\).*clearSecondAdministrationTime\(\)/s, 'Reselecting a paired initiation protocol must clear its prior component-two time');
assert.match(html, /function setProtocol\(id\)\{if\(!protocolOptions\(\)\.some\(option=>option\.id===id\)\|\|id===state\.protocol\)return;/, 'Re-clicking an already-selected initiation path must not clear documented component data');
assert.match(html, /function optionalDetailStops\(\)/, 'Selected conditional details must also be validated before a non-administration handoff is logged');
assert.match(html, /function refreshOutput\(\).*window\.render/s, 'Disposition invalidation must rebuild the final formatted note');
assert.match(html, /copy\(\[n\.cc,n\.as,n\.pl\]\.filter\(Boolean\)\.join\("\\n\\n────────────────────────────────\\n\\n"\)/, 'Copy All must preserve Tebra section boundaries without duplicating its headings');
assert.doesNotMatch(html, /copy\(`CC:\\n/, 'Copy All must not prepend duplicate CC, Assessment, or Plan headings for Tebra');

const drawerSearchLogic = section("const recordsDrawerState={query:'',filter:'all',lastFocus:null,closing:false};", 'function ensureRecordsDrawer(){');
const drawerFixture = [
  {
    id: 'draft-1',
    status: 'draft',
    updatedAt: '2026-07-29T19:00:00.000Z',
    patient: { name: 'Test, Draft', dob: '01/01/1990' },
    summary: 'Aripiprazole 400 mg',
    snapshot: { medKey: 'maintena', state: { dose: '400 mg', site: 'R deltoid', route: 'IM' }, fields: { orderingProvider: 'Dr Ordering', ndc: '12345-6789', lot: 'LOT-77', adminDate: '2026-07-29', tech: 'QA' } },
    addenda: []
  },
  {
    id: 'locked-1',
    status: 'completed',
    updatedAt: '2026-07-28T19:00:00.000Z',
    patient: { name: 'Test, Locked', dob: '02/02/1991' },
    summary: 'Paliperidone 156 mg',
    snapshot: { medKey: 'sustenna', state: { dose: '156 mg', site: 'L deltoid', route: 'IM' }, fields: { orderingProvider: 'Dr Locked', ndc: '98765-4321', lot: 'LOCK-88', adminDate: '2026-07-28', tech: 'QA' } },
    addenda: [{ author: 'QA', text: 'Follow-up clarification' }]
  }
];
const drawerSearchModel = vm.runInNewContext(
  '(() => { let records = ' + JSON.stringify(drawerFixture) + '; ' + drawerSearchLogic + '\nreturn { state: recordsDrawerState, drawerRecords }; })()',
  Object.create(null),
  { filename: 'index.html:records-drawer-search' }
);
drawerSearchModel.state.query = 'lot-77';
assert.deepEqual(json(drawerSearchModel.drawerRecords().map(record => record.id)), ['draft-1'], 'Record search must include lot traceability');
drawerSearchModel.state.query = 'dr locked';
assert.deepEqual(json(drawerSearchModel.drawerRecords().map(record => record.id)), ['locked-1'], 'Record search must include ordering provider');
drawerSearchModel.state.query = '';
drawerSearchModel.state.filter = 'completed';
assert.deepEqual(json(drawerSearchModel.drawerRecords().map(record => record.id)), ['locked-1'], 'Locked filter must show completed records only');
drawerSearchModel.state.filter = 'addenda';
assert.deepEqual(json(drawerSearchModel.drawerRecords().map(record => record.id)), ['locked-1'], 'Addenda filter must show records with dated addenda');

const initiationProtocol = section('<script id="rc539InitiationProtocolsScript">', '</script>');
assert.match(html, /<script id="rc539InitiationProtocolsScript">/, 'Expected RC5.39 order-verified initiation protocol support');
assert.match(initiationProtocol, /const relevantKeys=\['aristada','initio','maintena','asimtufii','sustenna'\]/, 'Initiation support must be scoped to the supported LAI products');
assert.match(initiationProtocol, /id:'maintena-1day'/, 'Abilify Maintena must offer its 1-day paired-injection path');
assert.match(initiationProtocol, /id:'maintena-14day'/, 'Abilify Maintena must offer its 14-day oral initiation path');
assert.match(initiationProtocol, /id:'asimtufii-1day'/, 'Abilify Asimtufii must offer its 1-day paired-injection path');
assert.match(initiationProtocol, /id:'aristada-initio-sameday'/, 'Aristada must offer its same-encounter INITIO path');
assert.match(initiationProtocol, /Do not combine the paired injections into one traceability record\./, 'Paired injections must retain separate traceability');
assert.match(initiationProtocol, /id="initSecondDose"/, 'Paired injections must record the second component dose');
assert.match(initiationProtocol, /id="initSecondSite"/, 'Paired injections must record the second component site');
assert.match(initiationProtocol, /id="initSecondNdc"/, 'Paired injections must record the second component NDC');
assert.match(initiationProtocol, /id="initSecondLot"/, 'Paired injections must record the second component lot');
assert.match(initiationProtocol, /id="initSecondExp"/, 'Paired injections must record the second component expiration');
assert.match(initiationProtocol, /Exact product and dose verified against the active order/, 'Paired injections must require active-order verification for component 2');
assert.match(initiationProtocol, /Injection component 2 was actually administered today/, 'Paired injections must require explicit documentation of component 2 administration');
assert.match(initiationProtocol, /primaryMuscle&&secondaryMuscle&&primaryMuscle===secondaryMuscle/, 'Paired injection validation must compare muscle groups');
assert.match(initiationProtocol, /The paired injection components are assigned to the same muscle group\./, 'Paired injections must hard-stop a shared muscle group');

const initiationDateHelpers = section('function dateParts(iso)', 'function siteMuscleKey(site)');
const day8Model = vm.runInNewContext(
  `(() => {${initiationDateHelpers}\nreturn { day8Window }; })()`,
  Object.create(null),
  { filename: 'index.html:initiation-day8' }
);
assert.deepEqual(json(day8Model.day8Window('2026-07-22')), {
  target: '2026-07-29', early: '2026-07-25', late: '2026-08-02', monthly: '2026-08-26'
});
assert.equal(day8Model.day8Window('not-a-date'), null, 'Day 8 calculator must require a valid documented Day 1 date');

const initiationSiteHelpers = section('function siteMuscleKey(site)', 'function protocolOptions(');
const siteMuscleKey = vm.runInNewContext(
  `(() => {${initiationSiteHelpers}\nreturn siteMuscleKey; })()`,
  Object.create(null),
  { filename: 'index.html:initiation-sites' }
);
assert.equal(siteMuscleKey('R ventrogluteal'), 'right-gluteal');
assert.equal(siteMuscleKey('R dorsogluteal'), 'right-gluteal');
assert.notEqual(siteMuscleKey('R deltoid'), siteMuscleKey('L deltoid'));

assert.match(initiationProtocol, /id:'sustenna-day8'/, 'Invega Sustenna must offer a dedicated Day 8 path');
assert.match(initiationProtocol, /day1Date:'?/, 'Invega Sustenna Day 8 state must store a dedicated Day 1 date');
assert.match(initiationProtocol, /id="initDay1Date"/, 'Invega Sustenna Day 8 must request the documented Day 1 date');
assert.match(initiationProtocol, /function day8Window\(day1\)/, 'Invega Sustenna must calculate Day 8 timing from Day 1');
assert.match(initiationProtocol, /target ±4 days/, 'Invega Sustenna Day 8 must display its permitted ±4-day window');
assert.match(initiationProtocol, /falls outside the calculated ±4-day window/, 'Out-of-window Day 8 dates must hard-stop documentation');
assert.match(initiationProtocol, /addCalendarDays\(state\.day1Date,35\)/, 'Day 8 return guidance must schedule monthly treatment from Day 1');
assert.match(initiationProtocol, /does not calculate doses, renal assessment, or missed-dose re-initiation/i, 'Day 8 support must not calculate dosing or re-initiation regimens');

assert.match(html, /window\.ipmgInitiationProtocolReview==='function'\?window\.ipmgInitiationProtocolReview\(\)/, 'Clinical disposition review must include initiation protocol stops');
assert.match(html, /initiation:call\(\(\)=>typeof window\.ipmgInitiationProtocolFingerprint==='function'\?window\.ipmgInitiationProtocolFingerprint\(\)/, 'Clinical disposition changes must include protocol state in the fingerprint');
assert.match(html, /initiation:clone\(call\(window\.ipmgInitiationProtocolSnapshot\)\|\|\{\}\)/, 'Draft snapshots must persist initiation protocol state');
assert.match(html, /call\(window\.restoreInitiationProtocol,snap\.initiation\|\|\{\}\)/, 'Draft restoration must restore initiation protocol state');
assert.match(html, /window\.ipmgInitiationProtocolLog==='function'\?window\.ipmgInitiationProtocolLog\(\)/, 'Injection activity logging must include initiation protocol details');
assert.match(html, /ipmgInitiationProtocolWorksheet==='function'\?window\.ipmgInitiationProtocolWorksheet\(\)/, 'Injection worksheets must include the selected initiation protocol when present');
assert.match(initiationProtocol, /window\.ipmgInitiationProtocolWorksheet=worksheetHtml/, 'Initiation protocol data must be available to the printed injection worksheet');

const samples = section('const SAMPLE_MEDS=[', 'const SAMPLE_INTENTS=[');
const sampleModel = vm.runInNewContext(
  `(() => {${samples}\nreturn SAMPLE_MEDS; })()`,
  Object.create(null),
  { filename: 'index.html:samples' }
);
const sampleMedication = key => {
  const result = sampleModel.find(med => med.key === key);
  assert.ok(result, `Missing ${key} sample medication definition`);
  return result;
};
assert.match(sampleMedication('cobenfy').guard, /Provider\/order verification required/i);
assert.match(sampleMedication('fanapt').guard, /QT-risk\/interaction review/i);
assert.match(sampleMedication('fanapt').sigOptions[0].titration, /stopped for more than 3 days/i);
assert.equal(sampleMedication('fanapt').sigOptions[1].label, 'Titration strength');
assert.match(sampleMedication('rexulti').guard, /not PRN/i);
assert.match(sampleMedication('rexulti').sigOptions[0].titration, /active provider plan\/PI adjustment/i);
assert.match(sampleMedication('rexulti').sigOptions[2].titration, /capped at 3 mg\/day/i);

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
