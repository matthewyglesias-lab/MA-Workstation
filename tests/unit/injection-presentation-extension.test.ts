import { afterEach, describe, expect, it, vi } from "vitest";

import {
  emptyInjectionEncounter,
  emptyInjectionInitiation,
} from "../../src/domain/injection";
import {
  injectionPresentationExtensionValue,
  injectionPresentationExtensionAvailable,
  installInjectionPresentationExtension,
  isUsableInjectionRecord,
  readInjectionPresentationExtension,
  TYPED_INJECTION_ENCOUNTER_KEY,
  withInjectionPresentationExtension,
} from "../../src/presentation/workflows/injection/injection-presentation-extension";

afterEach(() => vi.unstubAllGlobals());

const legacyBridge = (
  storage: { getItem: (key: string) => string | null },
  activeRecordId: string,
) => ({
  state: () => ({ activeRecordId }),
  list: () => JSON.parse(
    storage.getItem("ipmgMedAssistInjectionRecordsV1") ?? "[]",
  ),
});

describe("Injection presentation extension", () => {
  it("accepts a structurally safe historical completed v3 record and quarantines malformed addenda", () => {
    const historical = {
      id: "historical-v3",
      type: "injection",
      status: "completed",
      createdAt: "2026-09-01T08:00:00Z",
      updatedAt: "2026-09-01T08:05:00Z",
      completedAt: "2026-09-01T08:05:00Z",
      patient: { name: "Historical, Synthetic", dob: "01/02/1990" },
      summary: "Historical Injection",
      snapshot: {
        version: 3,
        medKey: "sustenna",
        fields: {
          ptName: "Historical, Synthetic",
          ptDOB: "01/02/1990",
        },
      },
      addenda: [{
        id: "add-1",
        createdAt: "2026-09-01T09:00:00Z",
        author: "Synthetic Staff",
        text: "Synthetic clarification.",
      }],
    };

    expect(isUsableInjectionRecord(historical)).toBe(true);
    expect(isUsableInjectionRecord({ ...historical, addenda: {} })).toBe(false);
    expect(isUsableInjectionRecord({
      ...historical,
      addenda: [{ ...historical.addenda[0], author: 42 }],
    })).toBe(false);

    const current: any = {
      ...historical,
      status: "draft",
      completedAt: "",
      snapshot: {
        version: 4,
        medKey: "sustenna",
        state: { attest: {}, flags: {}, guard: {} },
        initiation: { second: {} },
        smartVitals: {},
        disposition: {},
        fields: {
          ptName: "Historical, Synthetic",
          ptDOB: "01/02/1990",
          allergies: "NKDA",
          injWasteToggle: false,
        },
        safetyNone: false,
        note: { cc: "", as: "", pl: "" },
        documentation: {},
      },
    };
    expect(isUsableInjectionRecord(current)).toBe(true);
    const corruptions: Array<(record: any) => void> = [
      (record) => { record.snapshot.note.cc = {} as unknown as string; },
      (record) => { record.snapshot.state.attest = { allergy: "false" }; },
      (record) => { record.snapshot.state.flags = { oralOverlap: "false" }; },
      (record) => { record.snapshot.state.guard = { dizzy: "false" }; },
      (record) => { record.snapshot.initiation.planVerified = "false"; },
      (record) => { record.snapshot.initiation.second = { given: "false" }; },
      (record) => { record.snapshot.smartVitals.recheck = "false"; },
      (record) => { record.snapshot.fields.allergies = {}; },
      (record) => { record.snapshot.fields.injWasteToggle = "false"; },
    ];
    for (const corrupt of corruptions) {
      const candidate = structuredClone(current);
      corrupt(candidate);
      expect(isUsableInjectionRecord(candidate)).toBe(false);
    }
  });

  it("round-trips structured response and optional administration note facts", () => {
    const source = {
      ...emptyInjectionEncounter(),
      orderingProvider: "provider-register-id",
      habitus: "larger" as const,
      vitals: { weight: "215", weightUnit: "lb" as const },
      initiation: {
        ...emptyInjectionInitiation(),
        second: {
          ...emptyInjectionInitiation().second,
          ndc: " 50458-028-00 ",
        },
      },
      response: { kind: "bleed" as const, detail: "extended" },
      details: {
        siteAssessed: true,
        postInjectionObservation: true,
        educationProvided: true,
        departureStatus: "custom" as const,
        departureStatusNote: "Left with synthetic escort.",
      },
    };
    const legacyHydrate = {
      ...emptyInjectionEncounter(),
      initiation: {
        ...emptyInjectionInitiation(),
        second: {
          ...emptyInjectionInitiation().second,
          ndc: "50458-028-00",
        },
      },
      response: { kind: "custom" as const, custom: "legacy composed voice" },
    };

    const restored = withInjectionPresentationExtension(
      legacyHydrate,
      {
        [TYPED_INJECTION_ENCOUNTER_KEY]:
          injectionPresentationExtensionValue(source),
      },
    );

    expect(restored.response).toEqual(source.response);
    expect(restored.details).toMatchObject(source.details);
    expect(restored.orderingProvider).toBe("provider-register-id");
    expect(restored.habitus).toBe("larger");
    expect(restored.vitals).toMatchObject({ weight: "215", weightUnit: "lb" });
    expect(restored.initiation?.second.ndc).toBe(" 50458-028-00 ");
  });

  it("accepts an intentionally blank response detail without dropping the envelope", () => {
    const fallback = {
      ...emptyInjectionEncounter(),
      orderingProvider: "legacy display text",
    };
    const source = {
      ...fallback,
      orderingProvider: "provider-register-id",
      response: { kind: "well" as const, detail: "" },
    };

    const restored = withInjectionPresentationExtension(fallback, {
      [TYPED_INJECTION_ENCOUNTER_KEY]:
        injectionPresentationExtensionValue(source),
    });

    expect(restored.orderingProvider).toBe("provider-register-id");
    expect(restored.response).toEqual({ kind: "well", detail: "" });
  });

  it("keeps an older v1 envelope valid when paired-second NDC was not stored yet", () => {
    const fallback = {
      ...emptyInjectionEncounter(),
      initiation: {
        ...emptyInjectionInitiation(),
        second: {
          ...emptyInjectionInitiation().second,
          ndc: "50458-028-00",
        },
      },
    };
    const {
      pairedSecondNdc: _newField,
      ...currentEnvelope
    } = injectionPresentationExtensionValue(fallback);
    const olderEnvelope = { ...currentEnvelope, version: 1 };

    const restored = readInjectionPresentationExtension(fallback, {
      [TYPED_INJECTION_ENCOUNTER_KEY]: olderEnvelope,
    });

    expect(restored.status).toBe("valid");
    expect(restored.encounter.initiation?.second.ndc).toBe("50458-028-00");

    const intermediate = readInjectionPresentationExtension(fallback, {
      [TYPED_INJECTION_ENCOUNTER_KEY]: {
        ...olderEnvelope,
        pairedSecondNdc: " 50458-028-00 ",
      },
    });
    expect(intermediate.status).toBe("valid");
    expect(intermediate.encounter.initiation?.second.ndc)
      .toBe(" 50458-028-00 ");
  });

  it("round-trips intentional habitus and weight clears", () => {
    const fallback = {
      ...emptyInjectionEncounter(),
      habitus: "larger" as const,
      vitals: { bp: "120/80", weight: "215", weightUnit: "lb" as const },
    };
    const source = {
      ...fallback,
      habitus: undefined,
      vitals: { bp: "120/80" },
    };

    const restored = withInjectionPresentationExtension(fallback, {
      [TYPED_INJECTION_ENCOUNTER_KEY]:
        injectionPresentationExtensionValue(source),
    });

    expect(restored).not.toHaveProperty("habitus");
    expect(restored.vitals).toEqual({ bp: "120/80" });
  });

  it("ignores malformed and unrelated historical field values", () => {
    const encounter = emptyInjectionEncounter();
    expect(withInjectionPresentationExtension(encounter, { historical: true }))
      .toBe(encounter);
    expect(withInjectionPresentationExtension(encounter, {
      [TYPED_INJECTION_ENCOUNTER_KEY]: { version: "bad" },
    }))
      .toBe(encounter);
    expect(withInjectionPresentationExtension(encounter, {
      [TYPED_INJECTION_ENCOUNTER_KEY]: {
        ...injectionPresentationExtensionValue(encounter),
        response: { kind: "invented-response" },
      },
    })).toBe(encounter);
    expect(readInjectionPresentationExtension(encounter, {
      [TYPED_INJECTION_ENCOUNTER_KEY]: { version: "bad" },
    }).status).toBe("invalid");
    expect(readInjectionPresentationExtension(encounter, undefined).status)
      .toBe("absent");
    expect(readInjectionPresentationExtension(encounter, null).status)
      .toBe("invalid");
    expect(withInjectionPresentationExtension(encounter, {
      [TYPED_INJECTION_ENCOUNTER_KEY]: {
        ...injectionPresentationExtensionValue({
          ...encounter,
          orderingProvider: "must-not-partially-restore",
        }),
        details: {
          ...injectionPresentationExtensionValue(encounter).details,
          departureStatus: "invented-status",
        },
      },
    })).toBe(encounter);
  });

  it("reports unavailable instead of throwing when the storage prototype is locked", () => {
    class LockedStorage {
      setItem(_key: string, _value: string) {}
    }
    const nativeSetItem = LockedStorage.prototype.setItem;
    Object.defineProperty(LockedStorage.prototype, "setItem", {
      configurable: false,
      writable: false,
      value: nativeSetItem,
    });
    vi.stubGlobal("Storage", LockedStorage);
    vi.stubGlobal("window", { localStorage: new LockedStorage() });

    const restore = installInjectionPresentationExtension(
      () => emptyInjectionEncounter(),
    );

    expect(injectionPresentationExtensionAvailable()).toBe(false);
    expect(restore).not.toThrow();
  });

  it("refuses installation when durable records changed after legacy boot", () => {
    class FakeStorage {
      values = new Map<string, string>();
      getItem(key: string) {
        return this.values.get(key) ?? null;
      }
      setItem(key: string, value: string) {
        this.values.set(key, value);
      }
    }
    const localStorage = new FakeStorage();
    const externalBytes = JSON.stringify([{
      id: "external-after-boot",
      type: "injection",
      status: "draft",
    }]);
    localStorage.values.set("ipmgMedAssistInjectionRecordsV1", externalBytes);
    vi.stubGlobal("Storage", FakeStorage);
    vi.stubGlobal("window", {
      localStorage,
      IPMGRecords: {
        state: () => ({ activeRecordId: "" }),
        list: () => [],
      },
    });

    const restore = installInjectionPresentationExtension(
      () => emptyInjectionEncounter(),
    );

    expect(injectionPresentationExtensionAvailable()).toBe(false);
    expect(localStorage.getItem("ipmgMedAssistInjectionRecordsV1"))
      .toBe(externalBytes);
    expect(restore).not.toThrow();
  });

  it("atomically adds the envelope to an active completed-record write", () => {
    class FakeStorage {
      values = new Map<string, string>();
      getItem(key: string) {
        return this.values.get(key) ?? null;
      }
      setItem(key: string, value: string) {
        this.values.set(key, value);
      }
    }
    const localStorage = new FakeStorage();
    vi.stubGlobal("Storage", FakeStorage);
    vi.stubGlobal("window", {
      localStorage,
      IPMGRecords: legacyBridge(localStorage, "inj-active"),
    });
    const encounter = {
      ...emptyInjectionEncounter(),
      orderingProvider: "provider-register-id",
      response: { kind: "bleed" as const, detail: "extended" },
    };
    const onStored = vi.fn();
    const restore = installInjectionPresentationExtension(
      () => encounter,
      onStored,
    );
    const value = JSON.stringify([
      {
        id: "inj-active",
        type: "injection",
        status: "completed",
        snapshot: {
          version: 4,
          fields: { injProductSourceOther: "Synthetic custom source" },
          documentation: { existing: "preserved" },
        },
      },
    ]);

    localStorage.setItem("ipmgMedAssistInjectionRecordsV1", value);
    restore();

    const stored = JSON.parse(
      localStorage.values.get("ipmgMedAssistInjectionRecordsV1") ?? "[]",
    )[0];
    expect(stored.snapshot.fields.injProductSourceOther)
      .toBe("Synthetic custom source");
    expect(stored.snapshot.documentation.existing).toBe("preserved");
    expect(stored.snapshot.documentation.typedEncounterV1).toMatchObject({
      version: 2,
      orderingProvider: "provider-register-id",
      response: { kind: "bleed", detail: "extended" },
    });
    expect(onStored).toHaveBeenCalledOnce();
  });

  it("fails closed for duplicate active records without changing durable data", () => {
    class FakeStorage {
      values = new Map<string, string>();
      getItem(key: string) {
        return this.values.get(key) ?? null;
      }
      setItem(key: string, value: string) {
        this.values.set(key, value);
      }
    }
    const localStorage = new FakeStorage();
    localStorage.values.set(
      "ipmgMedAssistInjectionRecordsV1",
      "[]",
    );
    vi.stubGlobal("Storage", FakeStorage);
    vi.stubGlobal("window", {
      localStorage,
      IPMGRecords: legacyBridge(localStorage, "inj-active"),
    });
    const restore = installInjectionPresentationExtension(
      () => emptyInjectionEncounter(),
    );
    const duplicate = {
      id: "inj-active",
      type: "injection",
      status: "draft",
      snapshot: { version: 4, documentation: {} },
    };

    expect(() => localStorage.setItem(
      "ipmgMedAssistInjectionRecordsV1",
      JSON.stringify([duplicate, duplicate]),
    )).toThrow(/missing from its write/);
    expect(localStorage.values.get("ipmgMedAssistInjectionRecordsV1"))
      .toBe("[]");
    restore();
  });

  it("does not overwrite a present malformed extension", () => {
    class FakeStorage {
      values = new Map<string, string>();
      getItem(key: string) {
        return this.values.get(key) ?? null;
      }
      setItem(key: string, value: string) {
        this.values.set(key, value);
      }
    }
    const localStorage = new FakeStorage();
    localStorage.values.set(
      "ipmgMedAssistInjectionRecordsV1",
      "[]",
    );
    vi.stubGlobal("Storage", FakeStorage);
    vi.stubGlobal("window", {
      localStorage,
      IPMGRecords: legacyBridge(localStorage, "inj-active"),
    });
    const restore = installInjectionPresentationExtension(
      () => emptyInjectionEncounter(),
    );
    const value = JSON.stringify([{
      id: "inj-active",
      type: "injection",
      status: "draft",
      snapshot: {
        version: 4,
        documentation: {
          [TYPED_INJECTION_ENCOUNTER_KEY]: { version: "corrupt" },
        },
      },
    }]);

    expect(() => localStorage.setItem(
      "ipmgMedAssistInjectionRecordsV1",
      value,
    )).toThrow(/presentation data was malformed/);
    expect(localStorage.values.get("ipmgMedAssistInjectionRecordsV1"))
      .toBe("[]");
    restore();
  });

  it("rejects a clean outgoing draft when its durable extension is corrupt", () => {
    class FakeStorage {
      values = new Map<string, string>();
      getItem(key: string) {
        return this.values.get(key) ?? null;
      }
      setItem(key: string, value: string) {
        this.values.set(key, value);
      }
    }
    const key = "ipmgMedAssistInjectionRecordsV1";
    const durable = [{
      id: "inj-active",
      type: "injection",
      status: "draft",
      snapshot: {
        version: 4,
        documentation: {
          [TYPED_INJECTION_ENCOUNTER_KEY]: { version: "corrupt" },
        },
      },
    }];
    const localStorage = new FakeStorage();
    localStorage.values.set(key, JSON.stringify(durable));
    vi.stubGlobal("Storage", FakeStorage);
    vi.stubGlobal("window", {
      localStorage,
      IPMGRecords: legacyBridge(localStorage, "inj-active"),
    });
    const restore = installInjectionPresentationExtension(
      () => emptyInjectionEncounter(),
    );
    const outgoing = [{
      ...durable[0],
      snapshot: { version: 4, documentation: {} },
    }];

    expect(() => localStorage.setItem(key, JSON.stringify(outgoing)))
      .toThrow(/presentation data was malformed/);
    expect(localStorage.values.get(key)).toBe(JSON.stringify(durable));
    restore();
  });

  it("preserves the durable extension on inactive records", () => {
    class FakeStorage {
      values = new Map<string, string>();
      getItem(key: string) {
        return this.values.get(key) ?? null;
      }
      setItem(key: string, value: string) {
        this.values.set(key, value);
      }
    }
    const key = "ipmgMedAssistInjectionRecordsV1";
    const activeEnvelope = injectionPresentationExtensionValue({
      ...emptyInjectionEncounter(),
      orderingProvider: "active-provider",
    });
    const inactiveEnvelope = injectionPresentationExtensionValue({
      ...emptyInjectionEncounter(),
      orderingProvider: "inactive-provider",
      habitus: "larger",
    });
    const row = (id: string, extension?: unknown) => ({
      id,
      type: "injection",
      status: "draft",
      snapshot: {
        version: 4,
        documentation: extension
          ? { [TYPED_INJECTION_ENCOUNTER_KEY]: extension }
          : {},
      },
    });
    const durable = [
      row("inj-active", activeEnvelope),
      row("inj-inactive", inactiveEnvelope),
    ];
    const localStorage = new FakeStorage();
    localStorage.values.set(key, JSON.stringify(durable));
    vi.stubGlobal("Storage", FakeStorage);
    vi.stubGlobal("window", {
      localStorage,
      IPMGRecords: legacyBridge(localStorage, "inj-active"),
    });
    const restore = installInjectionPresentationExtension(
      () => ({
        ...emptyInjectionEncounter(),
        orderingProvider: "active-provider-updated",
      }),
    );

    localStorage.setItem(key, JSON.stringify([
      row("inj-active"),
      row("inj-inactive"),
    ]));
    const stored = JSON.parse(localStorage.values.get(key) ?? "[]");
    expect(stored[0].snapshot.documentation.typedEncounterV1.orderingProvider)
      .toBe("active-provider-updated");
    expect(stored[1].snapshot.documentation.typedEncounterV1)
      .toEqual(inactiveEnvelope);
    restore();
  });

  it("preserves an inactive extension when discard writes with no active id", () => {
    class FakeStorage {
      values = new Map<string, string>();
      getItem(key: string) {
        return this.values.get(key) ?? null;
      }
      setItem(key: string, value: string) {
        this.values.set(key, value);
      }
    }
    const key = "ipmgMedAssistInjectionRecordsV1";
    const envelope = injectionPresentationExtensionValue({
      ...emptyInjectionEncounter(),
      orderingProvider: "inactive-provider",
    });
    const durable = ["discarded", "retained"].map((id) => ({
      id,
      type: "injection",
      status: "draft",
      snapshot: {
        version: 4,
        documentation: { [TYPED_INJECTION_ENCOUNTER_KEY]: envelope },
      },
    }));
    const localStorage = new FakeStorage();
    localStorage.values.set(key, JSON.stringify(durable));
    vi.stubGlobal("Storage", FakeStorage);
    vi.stubGlobal("window", {
      localStorage,
      IPMGRecords: legacyBridge(localStorage, ""),
    });
    const onStored = vi.fn();
    const restore = installInjectionPresentationExtension(
      () => undefined,
      onStored,
    );
    const retainedWithoutExtension = {
      ...durable[1],
      snapshot: { version: 4, documentation: {} },
    };

    localStorage.setItem(key, JSON.stringify([retainedWithoutExtension]));
    const stored = JSON.parse(localStorage.values.get(key) ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe("retained");
    expect(stored[0].snapshot.documentation.typedEncounterV1)
      .toEqual(envelope);
    expect(onStored).not.toHaveBeenCalled();
    restore();
  });

  it("fails closed when an active record write has no current typed encounter", () => {
    class FakeStorage {
      values = new Map<string, string>();
      getItem(key: string) {
        return this.values.get(key) ?? null;
      }
      setItem(key: string, value: string) {
        this.values.set(key, value);
      }
    }
    const localStorage = new FakeStorage();
    vi.stubGlobal("Storage", FakeStorage);
    vi.stubGlobal("window", {
      localStorage,
      IPMGRecords: legacyBridge(localStorage, "inj-active"),
    });
    const restore = installInjectionPresentationExtension(() => undefined);

    expect(() => localStorage.setItem(
      "ipmgMedAssistInjectionRecordsV1",
      JSON.stringify([{
        id: "inj-active",
        type: "injection",
        status: "draft",
        snapshot: { version: 4, documentation: {} },
      }]),
    )).toThrow(/state was unavailable/);
    expect(localStorage.values.has("ipmgMedAssistInjectionRecordsV1"))
      .toBe(false);
    restore();
  });

  it("preserves a completed snapshot exactly while allowing an addendum write", () => {
    class FakeStorage {
      values = new Map<string, string>();
      getItem(key: string) {
        return this.values.get(key) ?? null;
      }
      setItem(key: string, value: string) {
        this.values.set(key, value);
      }
    }
    const key = "ipmgMedAssistInjectionRecordsV1";
    const snapshot = {
      version: 3,
      medKey: "sustenna",
      documentation: {
        existing: "locked",
        [TYPED_INJECTION_ENCOUNTER_KEY]: { version: "historical-corrupt" },
      },
    };
    const before = {
      id: "inj-active",
      type: "injection",
      status: "completed",
      updatedAt: "2026-09-01T08:05:00Z",
      snapshot,
      addenda: [],
    };
    const localStorage = new FakeStorage();
    localStorage.values.set(key, JSON.stringify([before]));
    vi.stubGlobal("Storage", FakeStorage);
    vi.stubGlobal("window", {
      localStorage,
      IPMGRecords: legacyBridge(localStorage, "inj-active"),
    });
    const onStored = vi.fn();
    const restore = installInjectionPresentationExtension(
      () => undefined,
      onStored,
    );
    const after = {
      ...before,
      updatedAt: "2026-09-01T09:00:00Z",
      // Same clinical snapshot as the legacy in-memory row, which does not
      // contain the presentation-owned durable extension.
      snapshot: { version: 3, medKey: "sustenna", documentation: { existing: "locked" } },
      addenda: [{ id: "add-1", text: "Synthetic clarification." }],
    };

    expect(() => localStorage.setItem(key, JSON.stringify([after])))
      .not.toThrow();
    const stored = JSON.parse(localStorage.values.get(key) ?? "[]")[0];
    expect(stored.snapshot).toEqual(snapshot);
    expect(stored.addenda).toEqual(after.addenda);
    expect(stored.updatedAt).toBe(after.updatedAt);
    expect(onStored).not.toHaveBeenCalled();
    restore();
  });

  it("rejects a stale-session write without changing externally updated bytes", () => {
    class FakeStorage {
      values = new Map<string, string>();
      getItem(key: string) {
        return this.values.get(key) ?? null;
      }
      setItem(key: string, value: string) {
        this.values.set(key, value);
      }
    }
    const key = "ipmgMedAssistInjectionRecordsV1";
    const localStorage = new FakeStorage();
    localStorage.values.set(key, "[]");
    vi.stubGlobal("Storage", FakeStorage);
    vi.stubGlobal("window", {
      localStorage,
      IPMGRecords: legacyBridge(localStorage, "inj-active"),
    });
    const restore = installInjectionPresentationExtension(
      () => emptyInjectionEncounter(),
    );
    const externalBytes = JSON.stringify([{ id: "external-record" }]);
    localStorage.values.set(key, externalBytes);

    expect(() => localStorage.setItem(key, JSON.stringify([{
      id: "inj-active",
      type: "injection",
      status: "draft",
      snapshot: { version: 4, documentation: {} },
    }]))).toThrow(/changed outside/);
    expect(localStorage.values.get(key)).toBe(externalBytes);
    restore();
  });

  it("does not report a failed callback or native write as a successful extension", () => {
    class FakeStorage {
      values = new Map<string, string>();
      fail = false;
      getItem(key: string) {
        return this.values.get(key) ?? null;
      }
      setItem(key: string, value: string) {
        if (this.fail) throw new Error("synthetic quota failure");
        this.values.set(key, value);
      }
    }
    const localStorage = new FakeStorage();
    vi.stubGlobal("Storage", FakeStorage);
    vi.stubGlobal("window", {
      localStorage,
      IPMGRecords: legacyBridge(localStorage, "inj-active"),
    });
    const onStored = vi.fn(() => {
      throw new Error("synthetic notification failure");
    });
    const restore = installInjectionPresentationExtension(
      () => emptyInjectionEncounter(),
      onStored,
    );
    const value = JSON.stringify([{
      id: "inj-active",
      type: "injection",
      status: "draft",
      snapshot: { version: 4, documentation: {} },
    }]);

    expect(() => localStorage.setItem(
      "ipmgMedAssistInjectionRecordsV1",
      value,
    )).not.toThrow();
    expect(onStored).toHaveBeenCalledOnce();
    const durable = localStorage.values.get("ipmgMedAssistInjectionRecordsV1");
    localStorage.fail = true;
    expect(() => localStorage.setItem(
      "ipmgMedAssistInjectionRecordsV1",
      value,
    )).toThrow(/quota failure/);
    expect(localStorage.values.get("ipmgMedAssistInjectionRecordsV1"))
      .toBe(durable);
    expect(onStored).toHaveBeenCalledOnce();
    restore();
  });
});
