import { describe, expect, it } from "vitest";

import {
  BUNDLED_INJECTION_NDC_OPTIONS,
  buildFdaNdcDirectoryUrl,
  createNdcOptionResolver,
  fdaNdcOptionsFromPayload,
  formatNdcPackageOption,
  normalizeKnownNdc,
  resolveNdcEntry,
  resolveNdcOptions,
  selectionForNdcInput,
  type NdcReferenceStorage,
} from "../../src/domain/injection-ndc";
import { createLegacyClinicalSource } from "../../src/legacy/clinical-source";
import type { InjectionEncounter } from "../../src/domain/injection";
import {
  INJECTION_RECORDS_STORAGE_KEY,
  InjectionRecordRepository,
  SafeStorage,
  type StorageLike,
} from "../../src/persistence";

class MemoryStorage implements StorageLike, NdcReferenceStorage {
  readonly values = new Map<string, string>();
  writes = 0;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes += 1;
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("Injection NDC package reference", () => {
  it("offers package choices by medication and exact selected strength", () => {
    const options = resolveNdcOptions({ medicationKey: "aristada", dose: "882 mg" });

    expect(options.map((option) => option.ndc)).toEqual([
      "65757-403-03",
      "65757-403-04",
    ]);
    expect(options.every((option) => option.strength === "882 mg/3.2 mL")).toBe(true);
    expect(resolveNdcOptions({ medicationKey: "aristada", dose: "441 mg" })).not.toContainEqual(
      expect.objectContaining({ ndc: "65757-403-03" }),
    );
  });

  it("keeps concentration-level options available where a total dose cannot determine the package", () => {
    const options = resolveNdcOptions({ medicationKey: "haldol", dose: "150 mg" });

    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ndc: "50458-253-03", strength: "50 mg/mL" }),
        expect.objectContaining({ ndc: "50458-254-14", strength: "100 mg/mL" }),
      ]),
    );
  });

  it("formats only a known scanned/pasted package and retains unknown NDC text", () => {
    const known = resolveNdcEntry("5914807280");
    const unknown = resolveNdcEntry("  12345-6789-01  ");
    const arbitraryElevenDigit = resolveNdcEntry("59148099999");
    const decoratedValue = resolveNdcEntry("x65757-401-03");

    expect(known).toMatchObject({ value: "59148-072-80", source: "bundled" });
    expect(resolveNdcEntry("50458-0564-01")).toMatchObject({
      value: "50458-564-01",
      source: "bundled",
    });
    expect(resolveNdcEntry("59148-0072-80")).toMatchObject({
      value: "59148-072-80",
      source: "bundled",
    });
    expect(normalizeKnownNdc("59148-072-80")).toBe("59148-072-80");
    expect(unknown).toEqual({ value: "  12345-6789-01  ", source: "custom" });
    expect(arbitraryElevenDigit).toEqual({ value: "59148099999", source: "custom" });
    expect(decoratedValue).toEqual({ value: "x65757-401-03", source: "custom" });
  });

  it("distinguishes package presentation and sample status for the same medication strength", () => {
    const options = resolveNdcOptions({ medicationKey: "maintena", dose: "400 mg" });
    const prefilled = options.find((option) => option.ndc === "59148-072-80");
    const sample = options.find((option) => option.ndc === "59148-072-92");
    const vial = options.find((option) => option.ndc === "59148-245-12");

    expect(formatNdcPackageOption(prefilled!)).toBe(
      "400 mg/1.9 mL prefilled dual-chamber syringe — 59148-072-80",
    );
    expect(sample?.packageKind).toBe("sample");
    expect(formatNdcPackageOption(sample!)).toContain("Sample — not for resale");
    expect(vial?.presentation).toBe("single-dose vial kit");
  });

  it("records known-package provenance while preserving a staff-entered custom NDC", () => {
    const query = { medicationKey: "maintena" as const, dose: "400 mg" };
    const options = resolveNdcOptions(query);

    expect(selectionForNdcInput("5914807280", query, options)).toMatchObject({
      ndc: "59148-072-80",
      source: "bundled",
      medicationKey: "maintena",
      dose: "400 mg",
    });
    expect(selectionForNdcInput("custom package code", query, options)).toMatchObject({
      ndc: "custom package code",
      source: "custom",
      medicationKey: "maintena",
      dose: "400 mg",
    });
  });

  it("converts FDA-listed package responses only for the selected product/dose", () => {
    const options = fdaNdcOptionsFromPayload(
      { medicationKey: "aristada", dose: "882 mg" },
      {
        results: [
          {
            product_ndc: "65757-403",
            dosage_form: "INJECTION, SUSPENSION, EXTENDED RELEASE",
            labeler_name: "Alkermes, Inc.",
            active_ingredients: [{ strength: "882 mg/3.2mL" }],
            packaging: [
              { package_ndc: "65757-403-99", description: "Test remote package", sample: true },
            ],
          },
          {
            product_ndc: "65757-401",
            active_ingredients: [{ strength: "441 mg/1.6mL" }],
            packaging: [{ package_ndc: "65757-401-99" }],
          },
        ],
      },
    );

    expect(options).toEqual([
      expect.objectContaining({
        ndc: "65757-403-99",
        dose: "882 mg",
        source: "remote",
        packageKind: "sample",
      }),
    ]);
  });

  it("builds the optional directory request from product information only", () => {
    const url = buildFdaNdcDirectoryUrl({ medicationKey: "aristada", dose: "882 mg" });

    expect(url).toContain("brand_name");
    expect(url).toContain("ARISTADA");
    expect(url?.toLocaleLowerCase()).not.toContain("patient");
    expect(url?.toLocaleLowerCase()).not.toContain("visit");
    expect(url?.toLocaleLowerCase()).not.toContain("staff");
  });

  it("uses a 24-hour, product-only browser cache and falls back silently after a refresh failure", async () => {
    const storage = new MemoryStorage();
    let time = Date.UTC(2026, 7, 3, 12, 0, 0);
    const requests: Array<{ medicationKey: string; dose: string }> = [];
    const resolver = createNdcOptionResolver({
      storage,
      now: () => time,
      fetcher: async (query) => {
        requests.push({ medicationKey: query.medicationKey, dose: query.dose });
        return {
          results: [
            {
              product_ndc: "65757-403",
              active_ingredients: [{ strength: "882 mg/3.2mL" }],
              packaging: [{ package_ndc: "65757-403-99", description: "Remote package" }],
            },
          ],
        };
      },
    });
    const query = { medicationKey: "aristada" as const, dose: "882 mg" };

    expect(resolver.lookup(query).remoteStatus).toBe("bundled");
    const refreshed = await resolver.refreshIfStale(query);
    expect(refreshed.remoteStatus).toBe("refreshed");
    expect(refreshed.options).toContainEqual(
      expect.objectContaining({ ndc: "65757-403-99", source: "remote" }),
    );
    expect(requests).toEqual([{ medicationKey: "aristada", dose: "882 mg" }]);

    await resolver.refreshIfStale(query);
    expect(requests).toHaveLength(1);

    time += 24 * 60 * 60 * 1000 + 1;
    let failedRequests = 0;
    const failing = createNdcOptionResolver({
      storage,
      now: () => time,
      fetcher: async () => {
        failedRequests += 1;
        throw new Error("offline");
      },
    });
    const fallback = await failing.refreshIfStale(query);
    expect(fallback.remoteStatus).toBe("fallback");
    expect(fallback.options).toEqual(resolveNdcOptions(query));
    expect((await failing.refreshIfStale(query)).remoteStatus).toBe("fallback");
    // The failed attempt is cached too, so an offline product lookup does not
    // repeatedly issue a request during the 24-hour throttle window.
    expect(failedRequests).toBe(1);
  });

  it("hydrates legacy/local records with metadata without rewriting older records", () => {
    const storage = new MemoryStorage();
    storage.values.set(
      INJECTION_RECORDS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "metadata-draft",
          type: "injection",
          status: "completed",
          createdAt: "2026-08-03T12:00:00.000Z",
          updatedAt: "2026-08-03T12:00:00.000Z",
          completedAt: "2026-08-03T12:10:00.000Z",
          patient: { name: "TEST, LOCAL", dob: "01/01/1990" },
          summary: "Aristada 882 mg",
          snapshot: {
            version: 4,
            medKey: "aristada",
            state: {},
            fields: { ndc: "65757-403-03", nextDate: "2026-10-01" },
            documentation: {
              clinicalReferenceVersion: "clinical-reference-v1",
              ndcSelection: {
                primary: {
                  ndc: "65757-403-03",
                  source: "bundled",
                  packageLabel: "882 mg prefilled syringe — 65757-403-03",
                },
              },
              nextDose: {
                value: "2026-10-01",
                source: "calculated",
                calculatedFrom: "2026-08-03|q8wk",
              },
            },
          },
          addenda: [],
          attestation: {
            staff: "Local MA",
            timestamp: "2026-08-03T12:10:00.000Z",
            statementVersion: "local-attestation-v1",
            documentation: {
              clinicalReferenceVersion: "clinical-reference-v1",
              ndcSelection: { primary: { ndc: "65757-403-03", source: "bundled" } },
            },
          },
          audit: [
            {
              id: "audit-1",
              event: "record_locked",
              timestamp: "2026-08-03T12:10:00.000Z",
              documentation: {
                nextDose: { value: "2026-10-01", source: "calculated" },
              },
            },
          ],
        },
      ]),
    );
    const before = storage.values.get(INJECTION_RECORDS_STORAGE_KEY);
    const repository = new InjectionRecordRepository(new SafeStorage(storage));
    const opened = repository.open("metadata-draft");

    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.value.snapshot.documentation).toMatchObject({
      ndcSelection: { primary: { source: "bundled", ndc: "65757-403-03" } },
      nextDose: { source: "calculated", value: "2026-10-01" },
    });
    expect(opened.value.attestation?.documentation).toMatchObject({
      ndcSelection: { primary: { ndc: "65757-403-03", source: "bundled" } },
    });
    expect(opened.value.audit?.[0]?.documentation).toMatchObject({
      nextDose: { value: "2026-10-01", source: "calculated" },
    });
    expect(storage.values.get(INJECTION_RECORDS_STORAGE_KEY)).toBe(before);
  });

  it("reads bridge metadata into the typed encounter without changing the plain NDC", () => {
    const source = createLegacyClinicalSource({
      document: { getElementById: () => null } as unknown as Document,
      window: {
        ipmgLegacyClinicalStateSnapshot: () => ({
          injection: {
            medicationKey: "aristada",
            documentation: {
              clinicalReferenceVersion: "clinical-reference-v1",
              ndcSelection: {
                primary: {
                  ndc: "65757-403-03",
                  source: "bundled",
                  medicationKey: "aristada",
                  dose: "882 mg",
                },
              },
              nextDose: {
                value: "2026-10-01",
                source: "calculated",
                calculatedFrom: "2026-08-03|q8wk",
              },
            },
          },
        }),
      } as unknown as Window & typeof globalThis,
    });
    const encounter = source.read("injection").encounter as InjectionEncounter;

    expect(encounter.traceability.ndc).toBe("");
    expect(encounter.details).toMatchObject({
      clinicalReferenceVersion: "clinical-reference-v1",
      ndcSelection: { primary: { ndc: "65757-403-03", source: "bundled" } },
      nextDose: { value: "2026-10-01", source: "calculated" },
    });
  });

  it("includes the paired-initiation package baseline", () => {
    expect(BUNDLED_INJECTION_NDC_OPTIONS).toContainEqual(
      expect.objectContaining({ medicationKey: "initio", dose: "675 mg", ndc: "65757-500-03" }),
    );
  });
});
