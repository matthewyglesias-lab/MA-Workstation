import { describe, expect, it } from "vitest";
import type { InjectionRecord } from "../../src/persistence/injection-records";
import type { SiteHistoryEntry } from "../../src/persistence/site-history";
import type { UdsRecord } from "../../src/persistence/uds-records";
import {
  buildPatientChartIndex,
  chartPatientKey,
  DEFAULT_PATIENT_NOTES_FILTER,
  filterPatientNotes,
  matchesPatientQuery,
  recentPatientNotes,
  scopeNotesToPatient,
  searchChartPatients,
  siteRotation,
  type ChartPatient,
} from "../../src/presentation/patient-chart-model";
import type { NotesTableRow } from "../../src/presentation/notes/note-table-model";

/**
 * Synthetic fixtures. Clinical-looking values here are invented for the test
 * and are not production patient data.
 */
const injection = (
  overrides: Partial<InjectionRecord> & {
    id: string;
    patient: { name: string; dob: string };
  },
): InjectionRecord =>
  ({
    type: "injection",
    status: "draft",
    createdAt: "2026-01-01T08:00:00-08:00",
    updatedAt: "2026-01-01T08:00:00-08:00",
    completedAt: "",
    summary: "Synthetic medication",
    snapshot: {
      version: 4,
      medKey: "other",
      state: {},
      initiation: {},
      smartVitals: {},
      disposition: {},
      fields: {},
      safetyNone: false,
      note: { cc: "", as: "", pl: "" },
    },
    addenda: [],
    ...overrides,
  }) as unknown as InjectionRecord;

const uds = (
  overrides: Partial<UdsRecord> & {
    id: string;
    patient: { name: string; dob: string };
  },
): UdsRecord =>
  ({
    type: "uds",
    status: "draft",
    createdAt: "2026-01-01T08:00:00-08:00",
    updatedAt: "2026-01-01T08:00:00-08:00",
    completedAt: "",
    summary: "Synthetic screen",
    snapshot: { collectionDateTime: "" },
    addenda: [],
    ...overrides,
  }) as unknown as UdsRecord;

const patientFixture = (overrides: Partial<ChartPatient> = {}): ChartPatient => ({
  key: chartPatientKey("Baker, Test", "02/03/1992"),
  name: "Baker, Test",
  dob: "02/03/1992",
  noteCount: 1,
  lastVisit: null,
  lastInjection: null,
  ...overrides,
});

describe("patient chart index", () => {
  it("groups notes by normalized name and exact date of birth", () => {
    const index = buildPatientChartIndex(
      [
        injection({
          id: "a",
          patient: { name: "Baker, Test", dob: "02/03/1992" },
          snapshot: { fields: { adminDate: "2026-08-03" } },
        } as never),
        injection({
          id: "b",
          patient: { name: "  baker,   test  ", dob: "02/03/1992" },
          snapshot: { fields: { adminDate: "2026-08-10" } },
        } as never),
        injection({
          id: "c",
          patient: { name: "Baker, Test", dob: "02/03/1993" },
          snapshot: { fields: { adminDate: "2026-08-11" } },
        } as never),
      ],
      [],
    );

    // Same name, same DOB collapses; the same name with a different DOB does
    // not. Identity is the pair, never the name alone.
    expect(index.patients).toHaveLength(2);
    const merged = index.patients.find((entry) => entry.dob === "02/03/1992");
    expect(merged?.noteCount).toBe(2);
  });

  it("leaves notes with incomplete identity out of the patient index", () => {
    const index = buildPatientChartIndex(
      [
        injection({ id: "named", patient: { name: "Baker, Test", dob: "02/03/1992" } }),
        injection({ id: "no-dob", patient: { name: "Carter, Test", dob: "" } }),
        injection({ id: "no-name", patient: { name: "", dob: "01/01/1990" } }),
      ],
      [],
    );

    expect(index.patients.map((entry) => entry.name)).toEqual(["Baker, Test"]);
    expect(index.rowsByPatient.size).toBe(1);
  });

  it("takes identity detail from the most recent note, not the first read", () => {
    const index = buildPatientChartIndex(
      [
        injection({
          id: "older",
          patient: { name: "Baker, Test", dob: "02/03/1992" },
          snapshot: {
            fields: { adminDate: "2026-05-01", allergies: "Penicillin" },
          },
        } as never),
        injection({
          id: "newer",
          patient: { name: "Baker, Test", dob: "02/03/1992" },
          snapshot: {
            fields: { adminDate: "2026-08-01", allergies: "NKDA verified" },
          },
        } as never),
      ],
      [],
    );

    expect(index.patients[0]?.allergyStatus).toBe("NKDA verified");
    expect(index.patients[0]?.localRecordId).toBe("newer");
  });

  it("reports the most recent injection with its site and date", () => {
    const index = buildPatientChartIndex(
      [
        injection({
          id: "older",
          patient: { name: "Baker, Test", dob: "02/03/1992" },
          summary: "Older medication",
          snapshot: { state: { site: "Left deltoid" }, fields: { adminDate: "2026-05-01" } },
        } as never),
        injection({
          id: "newer",
          patient: { name: "Baker, Test", dob: "02/03/1992" },
          summary: "Newer medication",
          snapshot: { state: { site: "Right deltoid" }, fields: { adminDate: "2026-08-01" } },
        } as never),
      ],
      [],
    );

    expect(index.patients[0]?.lastInjection).toMatchObject({
      recordId: "newer",
      medicationLabel: "Newer medication",
      site: "Right deltoid",
    });
  });

  it("does not let a UDS screen become the last injection", () => {
    const index = buildPatientChartIndex(
      [
        injection({
          id: "shot",
          patient: { name: "Baker, Test", dob: "02/03/1992" },
          summary: "Synthetic medication",
          snapshot: { fields: { adminDate: "2026-05-01" } },
        } as never),
      ],
      [
        uds({
          id: "screen",
          patient: { name: "Baker, Test", dob: "02/03/1992" },
          snapshot: { collectionDateTime: "2026-09-01T10:00" },
        } as never),
      ],
    );

    expect(index.patients[0]?.noteCount).toBe(2);
    expect(index.patients[0]?.lastInjection?.recordId).toBe("shot");
    // The last *visit* is still the newer UDS screen; only the injection card
    // is injection-scoped.
    expect(index.patients[0]?.lastVisit?.sortTime).toBeGreaterThan(
      index.patients[0]!.lastInjection!.visit.sortTime!,
    );
  });

  it("scopes a patient's notes newest visit first", () => {
    const index = buildPatientChartIndex(
      [
        injection({
          id: "mid",
          patient: { name: "Baker, Test", dob: "02/03/1992" },
          snapshot: { fields: { adminDate: "2026-06-01" } },
        } as never),
        injection({
          id: "newest",
          patient: { name: "Baker, Test", dob: "02/03/1992" },
          snapshot: { fields: { adminDate: "2026-08-01" } },
        } as never),
        injection({
          id: "other-patient",
          patient: { name: "Carter, Test", dob: "08/09/1994" },
          snapshot: { fields: { adminDate: "2026-09-01" } },
        } as never),
      ],
      [],
    );

    const key = chartPatientKey("Baker, Test", "02/03/1992");
    expect(scopeNotesToPatient(index, key).map((row) => row.recordId)).toEqual([
      "newest",
      "mid",
    ]);
    expect(scopeNotesToPatient(index, "no-such-patient")).toEqual([]);
  });
});

describe("patient search", () => {
  const baker = patientFixture();
  const carter = patientFixture({
    key: chartPatientKey("Carter, Rowan", "11/03/1994"),
    name: "Carter, Rowan",
    dob: "11/03/1994",
  });

  it("matches the first two or three letters of either half of the name", () => {
    expect(matchesPatientQuery(baker, "ba")).toBe(true);
    expect(matchesPatientQuery(baker, "bak")).toBe(true);
    expect(matchesPatientQuery(baker, "te")).toBe(true);
    expect(matchesPatientQuery(baker, "BA")).toBe(true);
    expect(matchesPatientQuery(baker, "ker")).toBe(false);
  });

  it("never matches on a single character", () => {
    expect(matchesPatientQuery(baker, "b")).toBe(false);
    expect(matchesPatientQuery(baker, " ")).toBe(false);
    expect(matchesPatientQuery(baker, "")).toBe(false);
  });

  it("matches a date of birth as it is typed", () => {
    expect(matchesPatientQuery(baker, "02")).toBe(true);
    expect(matchesPatientQuery(baker, "02/03")).toBe(true);
    expect(matchesPatientQuery(baker, "02/03/1992")).toBe(true);
    expect(matchesPatientQuery(baker, "02/04")).toBe(false);
    expect(matchesPatientQuery(carter, "02/03/1992")).toBe(false);
  });

  it("returns matches in the order given, capped at the requested limit", () => {
    const results = searchChartPatients([baker, carter], "te", 1);
    expect(results).toHaveLength(1);
    expect(searchChartPatients([baker, carter], "zz")).toEqual([]);
  });
});

describe("patient notes filtering", () => {
  const NOW = Date.UTC(2026, 8, 1);
  const row = (overrides: Partial<NotesTableRow>): NotesTableRow => ({
    key: "k",
    recordId: "r",
    noteType: "injection",
    typeLabel: "Injection",
    patientLabel: "Baker, Test",
    status: "incomplete",
    visit: {
      raw: "2026-08-30",
      label: "Aug 30, 2026",
      sortTime: Date.UTC(2026, 7, 30),
      source: "documented-visit",
      precision: "date",
    },
    lock: null,
    ...overrides,
  });

  it("passes everything through with the default filter", () => {
    const rows = [row({ key: "a" }), row({ key: "b", noteType: "uds" })];
    expect(filterPatientNotes(rows, DEFAULT_PATIENT_NOTES_FILTER, NOW)).toHaveLength(2);
  });

  it("filters by note type and lifecycle status", () => {
    const rows = [
      row({ key: "inj", noteType: "injection", status: "incomplete" }),
      row({ key: "uds", noteType: "uds", status: "signed", typeLabel: "UDS" }),
    ];
    expect(
      filterPatientNotes(rows, { ...DEFAULT_PATIENT_NOTES_FILTER, type: "uds" }, NOW),
    ).toHaveLength(1);
    expect(
      filterPatientNotes(rows, { ...DEFAULT_PATIENT_NOTES_FILTER, status: "signed" }, NOW)
        .map((item) => item.key),
    ).toEqual(["uds"]);
    // "Incomplete" covers everything not yet signed, including ready-to-sign.
    expect(
      filterPatientNotes(
        [row({ key: "ready", status: "ready-to-sign" })],
        { ...DEFAULT_PATIENT_NOTES_FILTER, status: "incomplete" },
        NOW,
      ),
    ).toHaveLength(1);
  });

  it("keeps undated notes out of the dated windows rather than assuming recent", () => {
    const undated = row({
      key: "undated",
      visit: {
        raw: null,
        label: "—",
        sortTime: null,
        source: "unavailable",
        precision: "date",
      },
    });
    expect(
      filterPatientNotes([undated], { ...DEFAULT_PATIENT_NOTES_FILTER, recency: "30-days" }, NOW),
    ).toEqual([]);
    expect(
      filterPatientNotes([undated], DEFAULT_PATIENT_NOTES_FILTER, NOW),
    ).toHaveLength(1);
  });

  it("narrows the visit-date window", () => {
    const rows = [
      row({ key: "recent", visit: { ...row({}).visit, sortTime: Date.UTC(2026, 7, 30) } }),
      row({ key: "old", visit: { ...row({}).visit, sortTime: Date.UTC(2024, 0, 1) } }),
    ];
    expect(
      filterPatientNotes(rows, { ...DEFAULT_PATIENT_NOTES_FILTER, recency: "30-days" }, NOW)
        .map((item) => item.key),
    ).toEqual(["recent"]);
    expect(
      filterPatientNotes(rows, { ...DEFAULT_PATIENT_NOTES_FILTER, recency: "12-months" }, NOW)
        .map((item) => item.key),
    ).toEqual(["recent"]);
  });

  it("searches the text a row actually shows", () => {
    const rows = [row({ key: "a", typeLabel: "Injection" }), row({ key: "b", typeLabel: "UDS" })];
    expect(
      filterPatientNotes(rows, { ...DEFAULT_PATIENT_NOTES_FILTER, query: "uds" }, NOW)
        .map((item) => item.key),
    ).toEqual(["b"]);
  });
});

describe("facesheet derivations", () => {
  const entry = (overrides: Partial<SiteHistoryEntry>): SiteHistoryEntry =>
    ({
      site: "Left deltoid",
      date: "2026-01-01",
      medKey: "other",
      route: "IM",
      recordId: "r",
      fingerprint: "f",
      storedAt: "2026-01-01T08:00:00-08:00",
      ...overrides,
    }) as SiteHistoryEntry;

  it("orders site rotation by administration date, newest first, capped at five", () => {
    const entries = [
      entry({ date: "2026-01-01", site: "A" }),
      entry({ date: "2026-06-01", site: "B" }),
      entry({ date: "2026-03-01", site: "C" }),
      entry({ date: "2026-05-01", site: "D" }),
      entry({ date: "2026-02-01", site: "E" }),
      entry({ date: "2026-04-01", site: "F" }),
    ];
    expect(siteRotation(entries).map((item) => item.site)).toEqual([
      "B",
      "D",
      "F",
      "C",
      "E",
    ]);
  });

  it("drops rotation entries that cannot say what or when", () => {
    expect(
      siteRotation([entry({ site: "" }), entry({ date: "" }), entry({ site: "Right deltoid" })]),
    ).toHaveLength(1);
  });

  it("caps recent notes at five, newest visit first", () => {
    const rows = Array.from({ length: 7 }, (_, position) => ({
      key: `k${position}`,
      recordId: `r${position}`,
      noteType: "injection" as const,
      typeLabel: "Injection",
      patientLabel: "Baker, Test",
      status: "incomplete" as const,
      visit: {
        raw: null,
        label: "",
        sortTime: Date.UTC(2026, 0, position + 1),
        source: "documented-visit" as const,
        precision: "date" as const,
      },
      lock: null,
    }));
    const recent = recentPatientNotes(rows);
    expect(recent).toHaveLength(5);
    expect(recent[0]?.recordId).toBe("r6");
  });
});
