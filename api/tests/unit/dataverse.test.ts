import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: class {
    getToken = vi.fn().mockResolvedValue({ token: "managed-identity-token" });
  },
}));

import type { DataverseConfiguration } from "../../src/config";
import {
  DataverseClinicalActionStore,
  DataverseError,
} from "../../src/dataverse";

const config: DataverseConfiguration = {
  url: "https://example.crm.dynamics.com",
  actionEntitySet: "ipmg_clinicalactions",
  draftJsonColumn: "ipmg_draftjson",
  finalJsonColumn: "ipmg_finaljson",
  statusColumn: "ipmg_workflowstatus",
  idempotencyColumn: "ipmg_idempotencykey",
  tebraAcknowledgedColumn: "ipmg_tebraacknowledged",
  checkInIdColumn: "ipmg_checkinid",
  patientIdColumn: "ipmg_patientid",
  orderIdColumn: "ipmg_orderid",
  patientContextColumn: "ipmg_patientcontextjson",
  draftStatusValue: 100000000,
  finalStatusValue: 100000001,
};

const configWithOptionalColumns: DataverseConfiguration = {
  ...config,
  orderContextColumn: "ipmg_ordercontextjson",
  acknowledgmentSourceColumn: "ipmg_acksource",
  acknowledgedAtColumn: "ipmg_ackatutc",
  acknowledgedByColumn: "ipmg_ackby",
  acknowledgedCheckInIdColumn: "ipmg_ackcheckinid",
};

const patientContextJson = '{"name":"Jordan Rivera","dob":"1988-04-12","mrn":"MRN-77821"}';

const draftRecord = {
  id: "9d7f434e-7f47-4c45-bd8e-c88d9a8cfbdd",
  etag: 'W/"42"',
  draftJson: '{"schemaVersion":"2026-08-30.1"}',
  finalJson: "",
  status: 100000000,
  idempotencyKey: "",
  tebraAcknowledged: true,
  checkInId: "check-in-200",
  patientId: "patient-300",
  orderId: "order-400",
  orderContextJson: "",
  patientContextJson,
  boardAcknowledgment: null,
  boardAcknowledgmentPartial: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Dataverse clinical-action transaction", () => {
  it("loads the row ETag, typed draft status, and protected check-in/patient/order identity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          "@odata.etag": draftRecord.etag,
          [config.draftJsonColumn]: draftRecord.draftJson,
          [config.finalJsonColumn]: "",
          [config.statusColumn]: config.draftStatusValue,
          [config.idempotencyColumn]: "",
          [config.tebraAcknowledgedColumn]: true,
          [config.checkInIdColumn]: draftRecord.checkInId,
          [config.patientIdColumn]: draftRecord.patientId,
          [config.orderIdColumn]: draftRecord.orderId,
          [config.patientContextColumn]: draftRecord.patientContextJson,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const store = new DataverseClinicalActionStore(config);
    const loaded = await store.load(draftRecord.id);

    expect(loaded).toEqual(draftRecord);
    expect(store.isDraft(loaded)).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      `/${config.actionEntitySet}(${draftRecord.id})?`,
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(config.checkInIdColumn);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(config.patientIdColumn);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(config.orderIdColumn);
  });

  it.each([
    ["check-in ID", config.checkInIdColumn],
    ["patient ID", config.patientIdColumn],
    ["order ID", config.orderIdColumn],
    ["patient-context", config.patientContextColumn],
  ])("fails closed when the protected %s column is missing", async (_label, column) => {
    const row: Record<string, unknown> = {
      "@odata.etag": draftRecord.etag,
      [config.draftJsonColumn]: draftRecord.draftJson,
      [config.finalJsonColumn]: "",
      [config.statusColumn]: config.draftStatusValue,
      [config.idempotencyColumn]: "",
      [config.tebraAcknowledgedColumn]: true,
      [config.checkInIdColumn]: draftRecord.checkInId,
      [config.patientIdColumn]: draftRecord.patientId,
      [config.orderIdColumn]: draftRecord.orderId,
      [config.patientContextColumn]: draftRecord.patientContextJson,
    };
    delete row[column];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(row), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const store = new DataverseClinicalActionStore(config);

    await expect(store.load(draftRecord.id)).rejects.toMatchObject<Partial<DataverseError>>({
      code: "invalid-record",
      status: 422,
    });
  });

  it.each([
    ["check-in ID", config.checkInIdColumn],
    ["patient ID", config.patientIdColumn],
    ["order ID", config.orderIdColumn],
  ])("fails closed when the protected %s column is whitespace-only", async (_label, column) => {
    const row: Record<string, unknown> = {
      "@odata.etag": draftRecord.etag,
      [config.draftJsonColumn]: draftRecord.draftJson,
      [config.finalJsonColumn]: "",
      [config.statusColumn]: config.draftStatusValue,
      [config.idempotencyColumn]: "",
      [config.tebraAcknowledgedColumn]: true,
      [config.checkInIdColumn]: draftRecord.checkInId,
      [config.patientIdColumn]: draftRecord.patientId,
      [config.orderIdColumn]: draftRecord.orderId,
      [config.patientContextColumn]: draftRecord.patientContextJson,
    };
    row[column] = "   ";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(row), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const store = new DataverseClinicalActionStore(config);

    await expect(store.load(draftRecord.id)).rejects.toMatchObject<Partial<DataverseError>>({
      code: "invalid-record",
      status: 422,
    });
  });

  it("trims a protected identity column that has leading/trailing whitespace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            "@odata.etag": draftRecord.etag,
            [config.draftJsonColumn]: draftRecord.draftJson,
            [config.finalJsonColumn]: "",
            [config.statusColumn]: config.draftStatusValue,
            [config.idempotencyColumn]: "",
            [config.tebraAcknowledgedColumn]: true,
            [config.checkInIdColumn]: `  ${draftRecord.checkInId}  `,
            [config.patientIdColumn]: draftRecord.patientId,
            [config.orderIdColumn]: draftRecord.orderId,
            [config.patientContextColumn]: draftRecord.patientContextJson,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const store = new DataverseClinicalActionStore(config);

    const loaded = await store.load(draftRecord.id);

    expect(loaded.checkInId).toBe(draftRecord.checkInId);
  });

  it("loads the optional order context and complete board acknowledgement provenance when configured", async () => {
    const boardAck = {
      source: "tebra-sync",
      acknowledgedAtUtc: "2026-08-30T18:00:00.000Z",
      acknowledgedBy: "checkin-board-integration",
      checkInId: "check-in-200",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            "@odata.etag": draftRecord.etag,
            [config.draftJsonColumn]: draftRecord.draftJson,
            [config.finalJsonColumn]: "",
            [config.statusColumn]: config.draftStatusValue,
            [config.idempotencyColumn]: "",
            [config.tebraAcknowledgedColumn]: true,
            [config.checkInIdColumn]: draftRecord.checkInId,
            [config.patientIdColumn]: draftRecord.patientId,
            [config.orderIdColumn]: draftRecord.orderId,
            [config.patientContextColumn]: draftRecord.patientContextJson,
            ipmg_ordercontextjson: '{"medicationKey":"sustenna"}',
            ipmg_acksource: boardAck.source,
            ipmg_ackatutc: boardAck.acknowledgedAtUtc,
            ipmg_ackby: boardAck.acknowledgedBy,
            ipmg_ackcheckinid: boardAck.checkInId,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const store = new DataverseClinicalActionStore(configWithOptionalColumns);

    const loaded = await store.load(draftRecord.id);

    expect(loaded.orderContextJson).toBe('{"medicationKey":"sustenna"}');
    expect(loaded.boardAcknowledgment).toEqual(boardAck);
  });

  it("treats board acknowledgement provenance as absent-but-partial unless all four columns are populated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            "@odata.etag": draftRecord.etag,
            [config.draftJsonColumn]: draftRecord.draftJson,
            [config.finalJsonColumn]: "",
            [config.statusColumn]: config.draftStatusValue,
            [config.idempotencyColumn]: "",
            [config.tebraAcknowledgedColumn]: true,
            [config.checkInIdColumn]: draftRecord.checkInId,
            [config.patientIdColumn]: draftRecord.patientId,
            [config.orderIdColumn]: draftRecord.orderId,
            [config.patientContextColumn]: draftRecord.patientContextJson,
            ipmg_acksource: "tebra-sync",
            // ipmg_ackatutc intentionally omitted
            ipmg_ackby: "checkin-board-integration",
            ipmg_ackcheckinid: "check-in-200",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const store = new DataverseClinicalActionStore(configWithOptionalColumns);

    const loaded = await store.load(draftRecord.id);

    // Distinct from "columns not configured at all" (which the previous test
    // covers via the base `config`): here the columns ARE configured, but
    // this row's data is incomplete, which the caller must fail closed on
    // rather than silently treat the same as "no board provenance."
    expect(loaded.boardAcknowledgment).toBeNull();
    expect(loaded.boardAcknowledgmentPartial).toBe(true);
  });

  it("does not mark board acknowledgement provenance partial when the columns are not configured at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            "@odata.etag": draftRecord.etag,
            [config.draftJsonColumn]: draftRecord.draftJson,
            [config.finalJsonColumn]: "",
            [config.statusColumn]: config.draftStatusValue,
            [config.idempotencyColumn]: "",
            [config.tebraAcknowledgedColumn]: true,
            [config.checkInIdColumn]: draftRecord.checkInId,
            [config.patientIdColumn]: draftRecord.patientId,
            [config.orderIdColumn]: draftRecord.orderId,
            [config.patientContextColumn]: draftRecord.patientContextJson,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const store = new DataverseClinicalActionStore(config);

    const loaded = await store.load(draftRecord.id);

    expect(loaded.boardAcknowledgment).toBeNull();
    expect(loaded.boardAcknowledgmentPartial).toBe(false);
  });

  it("marks board acknowledgement provenance partial when all four columns are configured but zero values are populated on the row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            "@odata.etag": draftRecord.etag,
            [config.draftJsonColumn]: draftRecord.draftJson,
            [config.finalJsonColumn]: "",
            [config.statusColumn]: config.draftStatusValue,
            [config.idempotencyColumn]: "",
            [config.tebraAcknowledgedColumn]: true,
            [config.checkInIdColumn]: draftRecord.checkInId,
            [config.patientIdColumn]: draftRecord.patientId,
            [config.orderIdColumn]: draftRecord.orderId,
            [config.patientContextColumn]: draftRecord.patientContextJson,
            // All four ack-provenance columns configured (configWithOptionalColumns
            // below), but none populated on this row at all.
            ipmg_acksource: "",
            ipmg_ackatutc: "",
            ipmg_ackby: "",
            ipmg_ackcheckinid: "",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const store = new DataverseClinicalActionStore(configWithOptionalColumns);

    const loaded = await store.load(draftRecord.id);

    // Distinct from "columns not configured" above: here the tenant wired
    // all four columns, asserting they will be populated, and this row has
    // none of them — that is a broken/missing board acknowledgement, not an
    // opt-out, so it must fail closed exactly like the 1-3-populated case.
    expect(loaded.boardAcknowledgment).toBeNull();
    expect(loaded.boardAcknowledgmentPartial).toBe(true);
  });

  it("atomically writes the final bundle, Choice status, and idempotency key, and never writes protected identity/acknowledgement columns", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const store = new DataverseClinicalActionStore(configWithOptionalColumns);

    await store.finalize(draftRecord, "f4d3700d-ec30-4f1f-87e1-9dd6b1bbce31", '{"status":"finalized"}');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    expect(new Headers(init.headers).get("If-Match")).toBe(draftRecord.etag);
    expect(JSON.parse(String(init.body))).toEqual({
      [config.finalJsonColumn]: '{"status":"finalized"}',
      [config.statusColumn]: 100000001,
      [config.idempotencyColumn]: "f4d3700d-ec30-4f1f-87e1-9dd6b1bbce31",
    });
  });

  it("turns a failed If-Match into a retry-safe concurrency conflict", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 412 })),
    );
    const store = new DataverseClinicalActionStore(config);

    await expect(
      store.finalize(draftRecord, "f4d3700d-ec30-4f1f-87e1-9dd6b1bbce31", "{}"),
    ).rejects.toMatchObject<Partial<DataverseError>>({
      code: "concurrency-conflict",
      status: 409,
    });
  });

  describe("hasResidualFinalArtifacts", () => {
    const store = new DataverseClinicalActionStore(config);

    it("is false for a genuinely fresh draft with no prior finalization", () => {
      expect(store.hasResidualFinalArtifacts(draftRecord)).toBe(false);
    });

    it("is true when a non-final record still carries Final JSON", () => {
      expect(
        store.hasResidualFinalArtifacts({
          ...draftRecord,
          finalJson: '{"status":"finalized"}',
        }),
      ).toBe(true);
    });

    it("is true when a non-final record still carries a persisted idempotency key", () => {
      expect(
        store.hasResidualFinalArtifacts({
          ...draftRecord,
          idempotencyKey: "f4d3700d-ec30-4f1f-87e1-9dd6b1bbce31",
        }),
      ).toBe(true);
    });

    it("treats a whitespace-only Final JSON value the same as truly blank", () => {
      expect(
        store.hasResidualFinalArtifacts({ ...draftRecord, finalJson: "   " }),
      ).toBe(false);
    });
  });
});
