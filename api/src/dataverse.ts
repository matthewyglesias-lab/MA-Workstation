import { DefaultAzureCredential } from "@azure/identity";

import type { DataverseConfiguration } from "./config";
import { normalizeSourceRecordVersion } from "./source-version";

export interface DataverseClinicalAction {
  id: string;
  etag: string;
  draftJson: string;
  finalJson: string;
  status: string | number;
  idempotencyKey: string;
  tebraAcknowledged: boolean;
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
    const select = [
      this.config.draftJsonColumn,
      this.config.finalJsonColumn,
      this.config.statusColumn,
      this.config.idempotencyColumn,
      this.config.tebraAcknowledgedColumn,
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
    if (!etag || !draftJson || tebraAcknowledged === null) {
      throw new DataverseError(
        "invalid-record",
        "The clinical action is missing its row version, draft JSON, or check-in acknowledgement state.",
        422,
      );
    }
    return {
      id,
      etag,
      draftJson,
      finalJson: readText(row[this.config.finalJsonColumn]),
      status: readStatus(row[this.config.statusColumn]),
      idempotencyKey: readText(row[this.config.idempotencyColumn]),
      tebraAcknowledged,
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
}
