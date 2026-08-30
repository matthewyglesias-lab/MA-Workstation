const WEAK_DATAVERSE_ETAG = /^W\/"[\x21\x23-\x7e]{1,120}"$/;

/**
 * Accepts only the opaque weak ETag returned by the Dataverse Web API. Canvas
 * never constructs this value from Version Number; EvaluateInjection reloads
 * the row and returns the exact token that FinalizeInjection must echo.
 */
export const normalizeSourceRecordVersion = (
  value: string,
): string | null => {
  return WEAK_DATAVERSE_ETAG.test(value) ? value : null;
};
