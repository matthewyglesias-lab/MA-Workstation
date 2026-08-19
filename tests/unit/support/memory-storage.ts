import type { StorageLike } from "../../../src/persistence";

export class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  writes = 0;
  failWrites = false;
  failReads = false;
  failRemoves = false;

  getItem(key: string): string | null {
    if (this.failReads) throw new DOMException("blocked", "SecurityError");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("quota");
    this.writes += 1;
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    if (this.failRemoves) throw new Error("remove failed");
    this.values.delete(key);
  }
}
