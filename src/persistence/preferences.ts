import {
  CLINIC_LOCATION_STORAGE_KEY,
  LEGACY_STAFF_STORAGE_KEY,
  STAFF_STORAGE_KEY,
  UDS_SIGNATURE_FIELDS_STORAGE_KEY,
} from "./keys";
import { success, type PersistenceResult, type SafeStorage } from "./storage";

export class PreferenceRepository {
  constructor(private readonly storage: SafeStorage) {}

  getStaff(migrateLegacy = true): PersistenceResult<string> {
    const current = this.storage.read(STAFF_STORAGE_KEY);
    if (!current.ok) return current;
    const value = current.value?.trim() ?? "";
    if (value) return success(value);
    const legacy = this.storage.read(LEGACY_STAFF_STORAGE_KEY);
    if (!legacy.ok) return legacy;
    const legacyValue = legacy.value?.trim() ?? "";
    if (!legacyValue || !migrateLegacy) return success(legacyValue);
    const warnings: string[] = [];
    const written = this.storage.write(STAFF_STORAGE_KEY, legacyValue);
    if (!written.ok) {
      warnings.push("Legacy staff value is usable but could not be migrated.");
      return success(legacyValue, warnings);
    }
    const removed = this.storage.remove(LEGACY_STAFF_STORAGE_KEY);
    if (!removed.ok) warnings.push("Legacy staff key could not be removed after migration.");
    return success(legacyValue, warnings);
  }

  setStaff(value: string): PersistenceResult<string> {
    const normalized = value.trim();
    const result = normalized
      ? this.storage.write(STAFF_STORAGE_KEY, normalized)
      : this.storage.remove(STAFF_STORAGE_KEY);
    return result.ok ? success(normalized, result.warnings) : result;
  }

  getClinicLocation(): PersistenceResult<string> {
    const result = this.storage.read(CLINIC_LOCATION_STORAGE_KEY);
    return result.ok ? success(result.value ?? "", result.warnings) : result;
  }

  setClinicLocation(value: string): PersistenceResult<string> {
    const result = this.storage.write(CLINIC_LOCATION_STORAGE_KEY, value);
    return result.ok ? success(value, result.warnings) : result;
  }

  getUdsSignatureFieldsEnabled(): PersistenceResult<boolean> {
    const result = this.storage.read(UDS_SIGNATURE_FIELDS_STORAGE_KEY);
    return result.ok ? success(result.value === "1", result.warnings) : result;
  }

  setUdsSignatureFieldsEnabled(enabled: boolean): PersistenceResult<boolean> {
    const result = this.storage.write(UDS_SIGNATURE_FIELDS_STORAGE_KEY, enabled ? "1" : "0");
    return result.ok ? success(enabled, result.warnings) : result;
  }
}
