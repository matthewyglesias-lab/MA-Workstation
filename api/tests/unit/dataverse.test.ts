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
  draftStatusValue: 100000000,
  finalStatusValue: 100000001,
};

const draftRecord = {
  id: "9d7f434e-7f47-4c45-bd8e-c88d9a8cfbdd",
  etag: 'W/"42"',
  draftJson: '{"schemaVersion":"2026-08-30.1"}',
  finalJson: "",
  status: 100000000,
  idempotencyKey: "",
  tebraAcknowledged: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Dataverse clinical-action transaction", () => {
  it("loads the row ETag and typed draft status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          "@odata.etag": draftRecord.etag,
          [config.draftJsonColumn]: draftRecord.draftJson,
          [config.finalJsonColumn]: "",
          [config.statusColumn]: config.draftStatusValue,
          [config.idempotencyColumn]: "",
          [config.tebraAcknowledgedColumn]: true,
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
  });

  it("atomically writes the final bundle, Choice status, and idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const store = new DataverseClinicalActionStore(config);

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
