import type { HttpResponseInit } from "@azure/functions";
import { randomUUID } from "node:crypto";
import type { ZodError } from "zod";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    correlationId: string;
  };
}

export const json = (
  status: number,
  body: unknown,
  correlationId: string,
  headers: Record<string, string> = {},
): HttpResponseInit => ({
  status,
  jsonBody: body,
  headers: {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Correlation-Id": correlationId,
    ...headers,
  },
});

export const apiError = (
  status: number,
  code: string,
  message: string,
  correlationId: string,
  details?: unknown,
): HttpResponseInit =>
  json(
    status,
    {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
        correlationId,
      },
    } satisfies ApiErrorBody,
    correlationId,
  );

export const zodDetails = (error: ZodError): unknown =>
  error.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message,
  }));

export const correlationIdFor = (candidate: string | null): string => {
  const value = String(candidate ?? "").trim();
  return /^[A-Za-z0-9._:-]{1,128}$/.test(value)
    ? value
    : randomUUID();
};
