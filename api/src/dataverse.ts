import { DefaultAzureCredential } from "@azure/identity";

import type { DataverseConfiguration } from "./config";
import { normalizeSourceRecordVersion } from "./source-version";

export interface DataverseBoardAcknowledgment {
  source: string;
  acknowledgedAtUtc: string;
  acknowledgedBy: string;
  checkInId: string;
}

export interface DataverseClinicalAction {
  id: string;
  etag: string;
  draftJson: string;
  finalJson: string;
  status: string | number;
  idempotencyKey: string;
  tebraAcknowledged: boolean;
  /** Board/integration-owned, Canvas-read-only identity. Authoritative over Draft JSON. Trimmed; whitespace-only is treated as missing. */
  checkInId: string;
  patientId: string;
  orderId: string;
  /** Raw JSON snapshot of the linked order, when the tenant configures it. "" when not configured. */
  orderContextJson: string;
  /** Raw JSON snapshot of the protected patient identity (name/DOB/MRN). The column is required, so this is always populated on a valid row. */
  patientContextJson: string;
  /** Real Tebra acknowledgement provenance from the board, when the tenant configures all four columns and the row carries all four values. */
  boardAcknowledgment: DataverseBoardAcknowledgment | null;
  /**
   * True when the four ack-provenance columns are configured but the row
   * does not carry all four values — zero, one, two, or three populated is
   * a broken or missing board acknowledgement that must never be silently
   * treated the same as "columns not configured at all" (a documented
   * acceptance-gate limitation). Only "columns configured and all four
   * populated" is a genuine board acknowledgement.
   */
  boardAcknowledgmentPartial: boolean;
}

export class DataverseError extends Error {
  constructor(
    readonly code:
      | "not-found"
      | "concurrency-conflict"
      | "idempotency-conflict"
      | "invalid-record"
      | "upstream-error",
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const credential = new DefaultAzureCredential();

const recordUrl = (config: DataverseConfiguration, id: string): string =>
  `${config.url}/api/data/v9.2/${config.actionEntitySet}(${id})`;

const token = async (config: DataverseConfiguration): Promise<string> => {
  const result = await credential.getToken(`${config.url}/.default`);
  if (!result?.token) {
    throw new DataverseError(
      "upstream-error",
      "Managed identity could not obtain a Dataverse token.",
      503,
    );
  }
  return result.token;
};

const headers = async (
  config: DataverseConfiguration,
): Promise<Record<string, string>> => ({
  Authorization: `Bearer ${await token(config)}`,
  Accept: "application/json",
  "Content-Type": "application/json; charset=utf-8",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
});

const readText = (value: unknown): string =>
  typeof value === "string" ? value : value == null ? "" : String(value);

const readStatus = (value: unknown): string | number =>
  typeof value === "number" || typeof value === "string" ? value : readText(value);

const readBoolean = (value: unknown): boolean | null => {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  return null;
};

export class DataverseClinicalActionStore {
  constructor(private readonly config: DataverseConfiguration) {}

  async load(id: string): Promise<DataverseClinicalAction> {
    const optionalColumns = [
      this.config.orderContextColumn,
      this.config.acknowledgmentSourceColumn,
      this.config.acknowledgedAtColumn,
      this.config.acknowledgedByColumn,
      this.config.acknowledgedCheckInIdColumn,
    ].filter((column): column is string => Boolean(column));
    const select = [
      this.config.draftJsonColumn,
      this.config.finalJsonColumn,
      this.config.statusColumn,
      this.config.idempotencyColumn,
      this.config.tebraAcknowledgedColumn,
      this.config.checkInIdColumn,
      this.config.patientIdColumn,
      this.config.orderIdColumn,
      this.config.patientContextColumn,
      ...optionalColumns,
    ].join(",");
    const response = await fetch(
      `${recordUrl(this.config, id)}?$select=${encodeURIComponent(select)}`,
      { headers: await headers(this.config) },
    );
    if (response.status === 404) {
      throw new DataverseError("not-found", "Clinical action was not found.", 404);
    }
    if (!response.ok) {
      throw new DataverseError(
        "upstream-error",
        `Dataverse returned HTTP ${response.status}.`,
        503,
      );
    }
    const row = (await response.json()) as Record<string, unknown>;
    const rawEtag =
      response.headers.get("etag") ?? readText(row["@odata.etag"]);
    const etag = normalizeSourceRecordVersion(rawEtag);
    const draftJson = readText(row[this.config.draftJsonColumn]);
    const tebraAcknowledged = readBoolean(
      row[this.config.tebraAcknowledgedColumn],
    );
    // Protected identifiers are trimmed before any comparison or presence
    // check — a whitespace-only value in Dataverse must fail closed exactly
    // like an empty one, never compare as a "matching" non-empty string.
    const checkInId = readText(row[this.config.checkInIdColumn]).trim();
    const patientId = readText(row[this.config.patientIdColumn]).trim();
    const orderId = readText(row[this.config.orderIdColumn]).trim();
    const patientContextJson = readText(row[this.config.patientContextColumn]);
    if (
      !etag ||
      !draftJson ||
      tebraAcknowledged === null ||
      !checkInId ||
      !patientId ||
      !orderId ||
      !patientContextJson.trim()
    ) {
      throw new DataverseError(
        "invalid-record",
        "The clinical action is missing its row version, draft JSON, check-in acknowledgement state, protected check-in/patient/order identity, or protected patient-context snapshot.",
        422,
      );
    }
    const ackColumnsConfigured = Boolean(
      this.config.acknowledgmentSourceColumn &&
        this.config.acknowledgedAtColumn &&
        this.config.acknowledgedByColumn &&
        this.config.acknowledgedCheckInIdColumn,
    );
    const boardSource = this.config.acknowledgmentSourceColumn
      ? readText(row[this.config.acknowledgmentSourceColumn]).trim()
      : "";
    const boardAcknowledgedAtUtc = this.config.acknowledgedAtColumn
      ? readText(row[this.config.acknowledgedAtColumn]).trim()
      : "";
    const boardAcknowledgedBy = this.config.acknowledgedByColumn
      ? readText(row[this.config.acknowledgedByColumn]).trim()
      : "";
    const boardCheckInId = this.config.acknowledgedCheckInIdColumn
      ? readText(row[this.config.acknowledgedCheckInIdColumn]).trim()
      : "";
    const boardValuesPresentCount = [
      boardSource,
      boardAcknowledgedAtUtc,
      boardAcknowledgedBy,
      boardCheckInId,
    ].filter(Boolean).length;
    // Any incomplete set (0, 1, 2, or 3 of 4) on a row where the columns
    // ARE configured is a broken or missing board acknowledgement — distinct
    // from "columns not configured at all" (ackColumnsConfigured false, a
    // documented acceptance-gate limitation) and must never be silently
    // treated the same as "not provided" by the caller. A tenant that wired
    // these columns is asserting the board will populate all four on every
    // acknowledged check-in; a row with zero populated values means the
    // board integration did not do so, not that the tenant opted out.
    const boardAcknowledgmentPartial =
      ackColumnsConfigured && boardValuesPresentCount < 4;
    const boardAcknowledgment: DataverseBoardAcknowledgment | null =
      ackColumnsConfigured && boardValuesPresentCount === 4
        ? {
            source: boardSource,
            acknowledgedAtUtc: boardAcknowledgedAtUtc,
            acknowledgedBy: boardAcknowledgedBy,
            checkInId: boardCheckInId,
          }
        : null;
    return {
      id,
      etag,
      draftJson,
      finalJson: readText(row[this.config.finalJsonColumn]),
      status: readStatus(row[this.config.statusColumn]),
      idempotencyKey: readText(row[this.config.idempotencyColumn]),
      tebraAcknowledged,
      checkInId,
      patientId,
      orderId,
      orderContextJson: this.config.orderContextColumn
        ? readText(row[this.config.orderContextColumn])
        : "",
      patientContextJson,
      boardAcknowledgment,
      boardAcknowledgmentPartial,
    };
  }

  async finalize(
    current: DataverseClinicalAction,
    idempotencyKey: string,
    finalJson: string,
  ): Promise<void> {
    if (Buffer.byteLength(finalJson, "utf8") > 900_000) {
      throw new DataverseError(
        "invalid-record",
        "The finalized document bundle exceeds the configured Dataverse text column limit.",
        422,
      );
    }
    const response = await fetch(recordUrl(this.config, current.id), {
      method: "PATCH",
      headers: {
        ...(await headers(this.config)),
        "If-Match": current.etag,
      },
      body: JSON.stringify({
        [this.config.finalJsonColumn]: finalJson,
        [this.config.statusColumn]: this.config.finalStatusValue,
        [this.config.idempotencyColumn]: idempotencyKey,
      }),
    });
    if (response.status === 412) {
      throw new DataverseError(
        "concurrency-conflict",
        "The clinical action changed while finalization was being saved.",
        409,
      );
    }
    if (!response.ok) {
      throw new DataverseError(
        "upstream-error",
        `Dataverse finalization returned HTTP ${response.status}.`,
        503,
      );
    }
  }

  isFinal(record: DataverseClinicalAction): boolean {
    return (
      String(record.status) === String(this.config.finalStatusValue) &&
      Boolean(record.finalJson)
    );
  }

  isDraft(record: DataverseClinicalAction): boolean {
    return String(record.status) === String(this.config.draftStatusValue);
  }

  /**
   * True when a record that is not currently final (draft, voided, or any
   * other non-final status) still carries a residual Final JSON payload or a
   * persisted idempotency key from a previous finalization. This is the
   * signature of a record that was finalized and then reset back to draft
   * status directly (e.g. by a status-column edit) rather than through an
   * explicit, audited reset/new-action process. Finalizing over it would
   * silently overwrite the prior finalized artifact, so callers must reject
   * such a record instead of finalizing it.
   */
  hasResidualFinalArtifacts(record: DataverseClinicalAction): boolean {
    return Boolean(record.finalJson.trim()) || Boolean(record.idempotencyKey.trim());
  }
}
