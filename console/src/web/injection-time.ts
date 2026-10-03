export function clinicDay(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format();
}
export function momentLabel(value: string, timezone: string) {
  return new Date(value).toLocaleString("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
export function clinicLocalInput(instant: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}
export function clinicInputToIso(value: string, timezone: string) {
  const normalized = value.length === 16 ? `${value}:00` : value;
  const assumed = Date.parse(`${normalized}Z`);
  if (!Number.isFinite(assumed))
    throw new Error("Enter a valid date and time.");
  let candidate = assumed;
  for (let i = 0; i < 3; i++) {
    const rendered = Date.parse(
      `${clinicLocalInput(new Date(candidate).toISOString(), timezone)}Z`,
    );
    candidate += assumed - rendered;
  }
  const matches = [candidate - 3600000, candidate, candidate + 3600000].filter(
    (t) => clinicLocalInput(new Date(t).toISOString(), timezone) === normalized,
  );
  if (matches.length !== 1)
    throw new Error(
      "This time is ambiguous or unavailable because of daylight saving time. Confirm the actual clinic time.",
    );
  return new Date(matches[0]!).toISOString();
}
