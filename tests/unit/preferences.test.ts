import { describe, expect, it } from "vitest";
import {
  CLINIC_LOCATION_STORAGE_KEY,
  LEGACY_STAFF_STORAGE_KEY,
  PreferenceRepository,
  STAFF_STORAGE_KEY,
  SafeStorage,
  UDS_SIGNATURE_FIELDS_STORAGE_KEY,
} from "../../src/persistence";
import { MemoryStorage } from "./support/memory-storage";

describe("PreferenceRepository.getStaff", () => {
  it("returns the current staff value when already present", () => {
    const memory = new MemoryStorage();
    memory.values.set(STAFF_STORAGE_KEY, "J. Rivera, MA");
    const repository = new PreferenceRepository(new SafeStorage(memory));
    const staff = repository.getStaff();
    expect(staff.ok && staff.value).toBe("J. Rivera, MA");
    expect(staff.ok && staff.warnings).toEqual([]);
  });

  it("migrates a legacy staff value, removing the old key", () => {
    const memory = new MemoryStorage();
    memory.values.set(LEGACY_STAFF_STORAGE_KEY, "Legacy MA");
    const repository = new PreferenceRepository(new SafeStorage(memory));
    const staff = repository.getStaff();
    expect(staff.ok && staff.value).toBe("Legacy MA");
    expect(staff.ok && staff.warnings).toEqual([]);
    expect(memory.values.get(STAFF_STORAGE_KEY)).toBe("Legacy MA");
    expect(memory.values.has(LEGACY_STAFF_STORAGE_KEY)).toBe(false);
  });

  it("still returns the legacy value with a warning when the migration write fails", () => {
    const memory = new MemoryStorage();
    memory.values.set(LEGACY_STAFF_STORAGE_KEY, "Legacy MA");
    memory.failWrites = true;
    const repository = new PreferenceRepository(new SafeStorage(memory));
    const staff = repository.getStaff();
    expect(staff.ok).toBe(true);
    if (!staff.ok) return;
    expect(staff.value).toBe("Legacy MA");
    expect(staff.warnings).toEqual(["Legacy staff value is usable but could not be migrated."]);
    expect(memory.values.has(LEGACY_STAFF_STORAGE_KEY)).toBe(true);
    expect(memory.values.has(STAFF_STORAGE_KEY)).toBe(false);
  });

  it("still returns the migrated value with a warning when removing the legacy key fails", () => {
    const memory = new MemoryStorage();
    memory.values.set(LEGACY_STAFF_STORAGE_KEY, "Legacy MA");
    memory.failRemoves = true;
    const repository = new PreferenceRepository(new SafeStorage(memory));
    const staff = repository.getStaff();
    expect(staff.ok).toBe(true);
    if (!staff.ok) return;
    expect(staff.value).toBe("Legacy MA");
    expect(staff.warnings).toEqual(["Legacy staff key could not be removed after migration."]);
    expect(memory.values.get(STAFF_STORAGE_KEY)).toBe("Legacy MA");
    expect(memory.values.has(LEGACY_STAFF_STORAGE_KEY)).toBe(true);
  });

  it("returns the legacy value verbatim without migrating when migrateLegacy is false", () => {
    const memory = new MemoryStorage();
    memory.values.set(LEGACY_STAFF_STORAGE_KEY, "Legacy MA");
    const repository = new PreferenceRepository(new SafeStorage(memory));
    const staff = repository.getStaff(false);
    expect(staff.ok && staff.value).toBe("Legacy MA");
    expect(memory.writes).toBe(0);
    expect(memory.values.has(STAFF_STORAGE_KEY)).toBe(false);
    expect(memory.values.has(LEGACY_STAFF_STORAGE_KEY)).toBe(true);
  });

  it("returns an empty string when neither the current nor legacy key has a value", () => {
    const repository = new PreferenceRepository(new SafeStorage(new MemoryStorage()));
    const staff = repository.getStaff();
    expect(staff.ok && staff.value).toBe("");
  });

  it("propagates an underlying read failure unwrapped", () => {
    const repository = new PreferenceRepository(new SafeStorage(null));
    const staff = repository.getStaff();
    expect(staff.ok).toBe(false);
    if (!staff.ok) expect(staff.error.code).toBe("storage-unavailable");
  });
});

describe("PreferenceRepository.setStaff", () => {
  it("writes a trimmed non-empty value", () => {
    const memory = new MemoryStorage();
    const repository = new PreferenceRepository(new SafeStorage(memory));
    const result = repository.setStaff("  J. Rivera, MA  ");
    expect(result.ok && result.value).toBe("J. Rivera, MA");
    expect(memory.values.get(STAFF_STORAGE_KEY)).toBe("J. Rivera, MA");
  });

  it("removes the key instead of writing an empty value", () => {
    const memory = new MemoryStorage();
    memory.values.set(STAFF_STORAGE_KEY, "Existing MA");
    const repository = new PreferenceRepository(new SafeStorage(memory));
    const result = repository.setStaff("   ");
    expect(result.ok && result.value).toBe("");
    expect(memory.values.has(STAFF_STORAGE_KEY)).toBe(false);
    expect(memory.writes).toBe(0);
  });

  it("propagates a write failure unwrapped", () => {
    const memory = new MemoryStorage();
    memory.failWrites = true;
    const repository = new PreferenceRepository(new SafeStorage(memory));
    const result = repository.setStaff("J. Rivera, MA");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("storage-write-failed");
  });
});

describe("PreferenceRepository clinic location and UDS signature-field preference", () => {
  it("round-trips the clinic location", () => {
    const memory = new MemoryStorage();
    const repository = new PreferenceRepository(new SafeStorage(memory));
    const initial = repository.getClinicLocation();
    expect(initial.ok && initial.value).toBe("");
    repository.setClinicLocation("Northside Clinic");
    const location = repository.getClinicLocation();
    expect(location.ok && location.value).toBe("Northside Clinic");
    expect(memory.values.get(CLINIC_LOCATION_STORAGE_KEY)).toBe("Northside Clinic");
  });

  it("round-trips the UDS signature-fields preference across the '1'-vs-other boundary", () => {
    const memory = new MemoryStorage();
    const repository = new PreferenceRepository(new SafeStorage(memory));
    const initial = repository.getUdsSignatureFieldsEnabled();
    expect(initial.ok && initial.value).toBe(false);

    repository.setUdsSignatureFieldsEnabled(true);
    expect(memory.values.get(UDS_SIGNATURE_FIELDS_STORAGE_KEY)).toBe("1");
    const enabled = repository.getUdsSignatureFieldsEnabled();
    expect(enabled.ok && enabled.value).toBe(true);

    repository.setUdsSignatureFieldsEnabled(false);
    expect(memory.values.get(UDS_SIGNATURE_FIELDS_STORAGE_KEY)).toBe("0");
    const disabled = repository.getUdsSignatureFieldsEnabled();
    expect(disabled.ok && disabled.value).toBe(false);
  });
});
