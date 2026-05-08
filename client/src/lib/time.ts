const UTC_OFFSETLESS_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?)?$/;

export const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

export function parseUtcDateLike(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = UTC_OFFSETLESS_DATE_RE.test(trimmed)
    ? `${trimmed.replace(" ", "T")}Z`
    : trimmed;

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
