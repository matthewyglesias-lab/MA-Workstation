import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import printBaseline from "../fixtures/print-baseline-v1.json";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function baselineCommitIsAvailable(): boolean {
  try {
    execFileSync(
      "git",
      ["cat-file", "-e", `${printBaseline.baselineCommit}^{commit}`],
      { cwd: projectRoot, stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

describe("pre-cutover print baseline", () => {
  it("anchors the fixture to the named production commit and blob", () => {
    expect(printBaseline.schemaVersion).toBe(1);
    expect(printBaseline.baselineCommit).toBe(
      "bc4a255d351793b59184760b537c7aef9abcf0bb",
    );
    expect(printBaseline.baselineIndexBlob).toBe(
      "2db13bcc1d79374f40364d22ef2fe675881ddef9",
    );
    expect(Object.keys(printBaseline.outputs).sort()).toEqual(
      [
        "avsSheet",
        "dailySheet",
        "injWorksheetSheet",
        "letterSheet",
        "sampleSheet",
        "sampleWorksheetSheet",
        "udsPatientSheet",
        "udsSheet",
      ].sort(),
    );
  });

  it("keeps the extracted legacy stylesheet byte-identical to production", () => {
    const css = readFileSync(
      fileURLToPath(
        new URL("../../public/legacy/legacy.css", import.meta.url),
      ),
      "utf8",
    );
    expect(Buffer.byteLength(css)).toBe(printBaseline.legacyCss.bytes);
    expect(sha256(css)).toBe(printBaseline.legacyCss.sha256);
  });

  it.skipIf(!baselineCommitIsAvailable())(
    "revalidates fixture provenance when the production object is available",
    () => {
      const html = execFileSync(
        "git",
        ["show", `${printBaseline.baselineCommit}:index.html`],
        {
          cwd: projectRoot,
          encoding: "utf8",
          maxBuffer: 8 * 1024 * 1024,
        },
      );
      const blob = execFileSync(
        "git",
        ["rev-parse", `${printBaseline.baselineCommit}:index.html`],
        { cwd: projectRoot, encoding: "utf8" },
      ).trim();

      expect(blob).toBe(printBaseline.baselineIndexBlob);
      expect(sha256(html)).toBe(printBaseline.baselineIndexSha256);
    },
  );
});
