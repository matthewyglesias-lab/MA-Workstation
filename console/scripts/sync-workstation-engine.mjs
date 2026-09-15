import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

// Keep the established workstation evaluator, catalog, and reference facts as
// one source. Do not edit the vendored files to change clinical behavior.
const consoleRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = path.resolve(consoleRoot, "..");
const destinationRoot = path.join(consoleRoot, "src/shared/workstation/domain");
const sources = [
  "contracts.ts",
  "dates.ts",
  "injection.ts",
  "injection-catalog.ts",
  "injection-clinical-reference.ts",
  "injection-needle.ts",
  "injection-ndc.ts",
  "injection-patient-screening.ts",
];
const check = process.argv.includes("--check");
const unknownArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== "--check");
if (unknownArguments.length) {
  throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}`);
}
const hash = (content) => createHash("sha256").update(content).digest("hex");
const manifestPath = path.join(destinationRoot, "provenance.json");
const existingManifest = await readFile(manifestPath, "utf8")
  .then((content) => JSON.parse(content))
  .catch(() => null);
const files = [];
const failures = [];
if (!check) await mkdir(destinationRoot, { recursive: true });

for (const name of sources) {
  const sourcePath = `src/domain/${name}`;
  const source = await readFile(path.join(repositoryRoot, sourcePath), "utf8");
  // ESM specifiers are the only semantic-free source adaptation. Prettier
  // normalizes the inherited source to the console's existing format gate.
  const adapted = source.replace(
    /(\bfrom\s+["'])(\.\.?\/[^"']+)(["'])/g,
    (_match, prefix, specifier, suffix) =>
      `${prefix}${path.extname(specifier) ? specifier : `${specifier}.js`}${suffix}`,
  );
  const vendored = await prettier.format(adapted, {
    parser: "typescript",
    filepath: path.join(destinationRoot, name),
  });
  const destinationPath = `console/src/shared/workstation/domain/${name}`;
  files.push({
    sourcePath,
    destinationPath,
    sourceSha256: hash(source),
    vendoredSha256: hash(vendored),
  });
  if (check) {
    const existing = await readFile(
      path.join(destinationRoot, name),
      "utf8",
    ).catch(() => "");
    if (existing !== vendored) failures.push(destinationPath);
  } else {
    await writeFile(path.join(destinationRoot, name), vendored);
  }
}

// Reuse the recorded provenance when source hashes agree. This keeps --check
// deterministic in shallow CI clones, where git log cannot recover file history.
const sourcesUnchanged = files.every((file) =>
  existingManifest?.files?.some(
    (previous) =>
      previous.sourcePath === file.sourcePath &&
      previous.sourceSha256 === file.sourceSha256,
  ),
);
const sourceCommit =
  sourcesUnchanged || check
    ? (existingManifest?.sourceCommit ?? "unknown")
    : execFileSync(
        "git",
        [
          "log",
          "-1",
          "--format=%H",
          "--",
          ...sources.map((name) => `src/domain/${name}`),
        ],
        { cwd: repositoryRoot, encoding: "utf8" },
      ).trim();
const manifest = await prettier.format(
  JSON.stringify({
    schemaVersion: 1,
    sourceRepository: "matthewyglesias-lab/MA-Workstation",
    sourceCommit,
    adaptation:
      "Relative ESM imports gain .js; Prettier formatting only. Clinical behavior is unchanged.",
    syncCommand: "node console/scripts/sync-workstation-engine.mjs",
    checkCommand: "node console/scripts/sync-workstation-engine.mjs --check",
    files,
  }),
  { parser: "json" },
);
if (check) {
  const existing = await readFile(manifestPath, "utf8").catch(() => "");
  if (existing !== manifest)
    failures.push("console/src/shared/workstation/domain/provenance.json");
  if (failures.length) {
    throw new Error(
      `Workstation engine source drift. Run the sync command and review the changes:\n${failures.join("\n")}`,
    );
  }
  console.log(
    `Verified all ${sources.length} workstation engine modules against their original source.`,
  );
} else {
  await writeFile(manifestPath, manifest);
  console.log(
    `Synced ${sources.length} workstation engine modules; clinical source commit ${sourceCommit}.`,
  );
}
