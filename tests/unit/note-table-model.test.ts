import { describe, expect, it } from "vitest";

import { emptyUdsEncounter } from "../../src/domain/uds";
import type { InjectionRecord } from "../../src/persistence/injection-records";
import type { UdsRecord } from "../../src/persistence/uds-records";
import {
  DEFAULT_NOTE_SORT,
  injectionRecordToNotesTableRow,
  nextNoteSort,
  noteLockLabel,
  notesTableRowAccessibleLabel,
  patientNoteOpenAccessibleLabel,
  sortNotesTableRows,
  udsRecordToNotesTableRow,
  type NotesTableRow,
} from "../../src/presentation/notes/note-table-model";

const injectionRecord = (
  overrides: Partial<InjectionRecord> = {},
): InjectionRecord => ({
  id: "inj-1",
  type: "injection",
  status: "draft",
  createdAt: "2026-07-01T08:00:00.000Z",
  updatedAt: "2026-07-01T08:00:00.000Z",
  completedAt: "",
  patient: { name: "Patel, Rowan", dob: "01/02/1990" },
  summary: "Medication",
  snapshot: {
    version: 4,
    medKey: "",
    state: {},
    initiation: {},
    smartVitals: {},
    disposition: {},
    fields: { adminDate: "2026-08-02" },
    safetyNone: false,
    note: { cc: "", as: "", pl: "" },
  },
  addenda: [],
  ...overrides,
});

const udsRecord = (overrides: Partial<UdsRecord> = {}): UdsRecord => ({
  id: "uds-1",
  type: "uds",
  status: "draft",
  createdAt: "2026-07-01T08:00:00.000Z",
  updatedAt: "2026-07-01T08:00:00.000Z",
  completedAt: "",
  patient: { name: "Patel, Rowan", dob: "01/02/1990" },
  summary: "UDS screen",
  snapshot: {
    ...emptyUdsEncounter(),
    collectionDateTime: "2026-08-02T09:41",
  },
  addenda: [],
  ...overrides,
});

const tableRow = (
  key: string,
  patientLabel: string,
  typeLabel: string,
  sortTime: number | null,
): NotesTableRow => ({
  key,
  recordId: key,
  noteType: typeLabel === "UDS" ? "uds" : "injection",
  typeLabel,
  patientLabel,
  status: "incomplete",
  visit: {
    raw: sortTime === null ? null : new Date(sortTime).toISOString(),
    label: sortTime === null ? "—" : String(sortTime),
    sortTime,
    source: sortTime === null ? "unavailable" : "created",
    precision: "datetime",
  },
  lock: null,
});

describe("Open Notes record adapters", () => {
  it("uses Injection administration date and UDS collection time as Visit Date", () => {
    const injection = injectionRecordToNotesTableRow(injectionRecord());
    expect(injection.visit).toMatchObject({
      raw: "2026-08-02",
      label: "Aug 2, 2026",
      source: "documented-visit",
      precision: "date",
    });
    expect(injection.visit.sortTime).toBe(new Date(2026, 7, 2).getTime());

    const uds = udsRecordToNotesTableRow(udsRecord());
    expect(uds.visit).toMatchObject({
      raw: "2026-08-02T09:41",
      label: "Aug 2, 2026, 9:41 AM",
      source: "documented-visit",
      precision: "datetime",
    });
  });

  it("falls back only to createdAt when the documented date is absent or invalid", () => {
    const row = injectionRecordToNotesTableRow(
      injectionRecord({
        createdAt: "2026-07-30T11:22:00.000Z",
        updatedAt: "2035-01-01T00:00:00.000Z",
        completedAt: "2036-01-01T00:00:00.000Z",
        snapshot: {
          ...injectionRecord().snapshot,
          fields: { adminDate: "2026-02-30" },
        },
      }),
    );
    expect(row.visit.raw).toBe("2026-07-30T11:22:00.000Z");
    expect(row.visit.source).toBe("created");
    expect(row.visit.sortTime).toBe(new Date("2026-07-30T11:22:00.000Z").getTime());
  });

  it("renders an unavailable Visit Date when both allowed sources are invalid", () => {
    const row = udsRecordToNotesTableRow(
      udsRecord({
        createdAt: "also-not-a-date",
        snapshot: { ...emptyUdsEncounter(), collectionDateTime: "2026-02-30T10:00" },
      }),
    );
    expect(row.visit).toMatchObject({
      raw: null,
      label: "—",
      sortTime: null,
      source: "unavailable",
    });
  });

  it("defensively handles an older Injection snapshot without fields", () => {
    const row = injectionRecordToNotesTableRow(
      injectionRecord({ snapshot: {} as InjectionRecord["snapshot"] }),
    );
    expect(row.visit.source).toBe("created");
  });

  it("maps persisted lifecycle truthfully without inferring live readiness", () => {
    const strayAttestation = {
      staff: "Should Not Lock",
      timestamp: "2026-08-02T09:41:00.000Z",
      statementVersion: "1",
    };
    const draft = injectionRecordToNotesTableRow(
      injectionRecord({ status: "draft", attestation: strayAttestation }),
    );
    expect(draft.status).toBe("incomplete");
    expect(draft.lock).toBeNull();

    const legacySigned = injectionRecordToNotesTableRow(
      injectionRecord({ status: "completed", attestation: undefined }),
    );
    expect(legacySigned.status).toBe("signed");
    expect(legacySigned.lock).toEqual({});
  });
});

describe("Open Notes lock detail", () => {
  it("uses whatever truthful signing detail is available", () => {
    expect(
      noteLockLabel({ staff: "A. Rivera, MA", timestamp: "2026-08-02T09:41" }),
    ).toBe("Signed by A. Rivera, MA · Aug 2, 9:41 AM");
    expect(noteLockLabel({ staff: "A. Rivera, MA" })).toBe("Signed by A. Rivera, MA");
    expect(noteLockLabel({ timestamp: "2026-08-02T09:41" })).toBe(
      "Signed · Aug 2, 9:41 AM",
    );
    expect(noteLockLabel({})).toBe("Signed · signer details unavailable");
    expect(noteLockLabel({ staff: "A. Rivera, MA", timestamp: "invalid" })).toBe(
      "Signed by A. Rivera, MA",
    );
  });
});

describe("patient note Open names", () => {
  it("adds the stable local record id only when visible note facts collide", () => {
    const first = tableRow("first", "Patel, Rowan", "Injection", 1);
    first.visit.label = "Aug 2, 2026";
    const second = {
      ...first,
      key: "second",
      recordId: "second",
    };
    const distinct = tableRow("distinct", "Patel, Rowan", "UDS", 1);
    distinct.visit.label = "Aug 2, 2026";

    expect(patientNoteOpenAccessibleLabel(distinct, [first, distinct])).toBe(
      "Open incomplete UDS note from Aug 2, 2026",
    );

    const names = [first, second].map((row) =>
      patientNoteOpenAccessibleLabel(row, [first, second]),
    );
    expect(names).toEqual([
      "Open incomplete Injection note from Aug 2, 2026, saved note first",
      "Open incomplete Injection note from Aug 2, 2026, saved note second",
    ]);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("global Open Notes row names", () => {
  it("includes visit detail and adds the record id only for exact collisions", () => {
    const first = tableRow("first", "Patel, Rowan", "Injection", 1);
    first.visit.label = "Aug 2, 2026";
    const later = tableRow("later", "Patel, Rowan", "Injection", 2);
    later.visit.label = "Aug 3, 2026";
    const duplicate = {
      ...first,
      key: "duplicate",
      recordId: "duplicate",
    };

    expect(notesTableRowAccessibleLabel(later, [first, later])).toBe(
      "Open incomplete Injection note for Patel, Rowan, visit Aug 3, 2026",
    );

    const names = [first, duplicate].map((row) =>
      notesTableRowAccessibleLabel(row, [first, duplicate]),
    );
    expect(names).toEqual([
      "Open incomplete Injection note for Patel, Rowan, visit Aug 2, 2026, saved note first",
      "Open incomplete Injection note for Patel, Rowan, visit Aug 2, 2026, saved note duplicate",
    ]);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("Open Notes sorting", () => {
  const older = Date.UTC(2026, 6, 1);
  const newer = Date.UTC(2026, 7, 1);
  const rows = [
    tableRow("missing", "Zulu", "UDS", null),
    tableRow("older", "beta", "Injection", older),
    tableRow("newer", "Alpha", "UDS", newer),
  ];

  it("defaults to Visit Date descending without mutating the input", () => {
    const before = rows.slice();
    expect(sortNotesTableRows(rows, DEFAULT_NOTE_SORT).map((row) => row.key)).toEqual([
      "newer",
      "older",
      "missing",
    ]);
    expect(rows).toEqual(before);
  });

  it("keeps missing dates last in both Visit Date directions", () => {
    expect(
      sortNotesTableRows(rows, { key: "visitDate", direction: "asc" }).map(
        (row) => row.key,
      ),
    ).toEqual(["older", "newer", "missing"]);
  });

  it("sorts Patient and Type ascending first and reverses on second activation", () => {
    const patientSort = nextNoteSort(DEFAULT_NOTE_SORT, "patient");
    expect(patientSort).toEqual({ key: "patient", direction: "asc" });
    expect(sortNotesTableRows(rows, patientSort).map((row) => row.key)).toEqual([
      "newer",
      "older",
      "missing",
    ]);
    expect(nextNoteSort(patientSort, "patient")).toEqual({
      key: "patient",
      direction: "desc",
    });
    expect(nextNoteSort(DEFAULT_NOTE_SORT, "type")).toEqual({
      key: "type",
      direction: "asc",
    });
  });

  it("uses latest visit, patient, type, then key as deterministic tie breakers", () => {
    const tied = [
      tableRow("z", "Same", "UDS", older),
      tableRow("b", "Same", "Injection", newer),
      tableRow("a", "Same", "Injection", newer),
    ];
    expect(
      sortNotesTableRows(tied, { key: "patient", direction: "asc" }).map(
        (row) => row.key,
      ),
    ).toEqual(["a", "b", "z"]);
  });
});
