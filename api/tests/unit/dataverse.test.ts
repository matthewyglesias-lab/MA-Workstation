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
  boardAcknowledgment: null,
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

  it("treats board acknowledgement provenance as absent unless all four columns are populated", async () => {
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

    expect(loaded.boardAcknowledgment).toBeNull();
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
});
