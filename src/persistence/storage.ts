export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistenceFailure {
  ok: false;
  error: {
    code:
      | "storage-unavailable"
      | "storage-read-failed"
      | "storage-write-failed"
      | "storage-remove-failed"
      | "invalid-data"
      | "not-found"
      | "immutable-record"
      | "validation";
    message: string;
    cause?: unknown;
  };
}

export interface PersistenceSuccess<T> {
  ok: true;
  value: T;
  warnings: string[];
}

export type PersistenceResult<T> = PersistenceSuccess<T> | PersistenceFailure;

export const success = <T>(value: T, warnings: string[] = []): PersistenceSuccess<T> => ({
  ok: true,
  value,
  warnings,
});

export const failure = (
  code: PersistenceFailure["error"]["code"],
  message: string,
  cause?: unknown,
): PersistenceFailure => ({
  ok: false,
  error: { code, message, ...(cause === undefined ? {} : { cause }) },
});

export class SafeStorage {
  constructor(private readonly storage: StorageLike | null) {}

  get available(): boolean {
    return this.storage !== null;
  }

  read(key: string): PersistenceResult<string | null> {
    if (!this.storage) {
      return failure("storage-unavailable", "Browser-local storage is unavailable.");
    }
    try {
      return success(this.storage.getItem(key));
    } catch (cause) {
      return failure("storage-read-failed", `Unable to read browser-local storage key "${key}".`, cause);
    }
  }

  write(key: string, value: string): PersistenceResult<void> {
    if (!this.storage) {
      return failure("storage-unavailable", "Browser-local storage is unavailable.");
    }
    try {
      this.storage.setItem(key, value);
      return success(undefined);
    } catch (cause) {
      return failure(
        "storage-write-failed",
        `Unable to save browser-local storage key "${key}".`,
        cause,
      );
    }
  }

  remove(key: string): PersistenceResult<void> {
    if (!this.storage) {
      return failure("storage-unavailable", "Browser-local storage is unavailable.");
    }
    try {
      this.storage.removeItem(key);
      return success(undefined);
    } catch (cause) {
      return failure(
        "storage-remove-failed",
        `Unable to remove browser-local storage key "${key}".`,
        cause,
      );
    }
  }
}

export const browserSafeStorage = (): SafeStorage => {
  try {
    const browserWindow = (
      globalThis as typeof globalThis & {
        window?: { localStorage?: StorageLike };
      }
    ).window;
    return new SafeStorage(browserWindow?.localStorage ?? null);
  } catch {
    // Accessing either `window` or the `localStorage` getter can itself throw
    // (for example in a blocked/sandboxed browser context). Keep that failure
    // inside the persistence boundary so importing or creating the repository
    // cannot crash the workstation.
    return new SafeStorage(null);
  }
};

export const deepClone = <T>(value: T): T => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
};

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export const deepMergePreservingUnknown = <T>(
  base: T | undefined,
  update: T,
): T => {
  if (!isPlainObject(base) || !isPlainObject(update)) return deepClone(update);
  const merged: Record<string, unknown> = { ...deepClone(base) };
  Object.entries(update).forEach(([key, next]) => {
    const previous = merged[key];
    merged[key] =
      isPlainObject(previous) && isPlainObject(next)
        ? deepMergePreservingUnknown(previous, next)
        : deepClone(next);
  });
  return merged as T;
};
