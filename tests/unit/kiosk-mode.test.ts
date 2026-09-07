import { describe, expect, it } from "vitest";

import { SafeStorage, type StorageLike } from "../../src/persistence/storage";
import {
  KIOSK_MODE_STORAGE_KEY,
  kioskModeUrl,
  readKioskMode,
  resolveKioskMode,
  writeKioskMode,
} from "../../src/presentation/use-kiosk-mode";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("Injection focus preference", () => {
  it("lets an explicit query value override the stored preference", () => {
    expect(resolveKioskMode("?kiosk=1", "0")).toBe(true);
    expect(resolveKioskMode("?kiosk=0", "1")).toBe(false);
    expect(resolveKioskMode("?view=today", "1")).toBe(true);
    expect(resolveKioskMode("?view=today", null)).toBe(false);
  });

  it("persists only the presentation preference", () => {
    const memory = new MemoryStorage();
    const storage = new SafeStorage(memory);

    writeKioskMode(true, storage);
    expect(memory.getItem(KIOSK_MODE_STORAGE_KEY)).toBe("1");
    expect(readKioskMode("", storage)).toBe(true);

    writeKioskMode(false, storage);
    expect(memory.getItem(KIOSK_MODE_STORAGE_KEY)).toBe("0");
    expect(readKioskMode("", storage)).toBe(false);
  });

  it("preserves unrelated query parameters and the hash", () => {
    const href = "https://workstation.test/?view=today#active-note";
    expect(kioskModeUrl(href, true)).toBe(
      "/?view=today&kiosk=1#active-note",
    );
    expect(kioskModeUrl(`${href.replace("#active-note", "")}&kiosk=1#active-note`, false)).toBe(
      "/?view=today#active-note",
    );
  });
});
