export function firstParam(param: unknown): string | undefined {
  const value = Array.isArray(param) ? param[0] : param;
  return typeof value === "string" ? value : undefined;
}

export function parseIntegerParam(param: unknown): number {
  const value = firstParam(param);
  return value === undefined ? Number.NaN : Number.parseInt(value, 10);
}
