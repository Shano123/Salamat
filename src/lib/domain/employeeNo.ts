// Employee numbers from fingerprint devices and Excel often lose leading zeros
// (Staff ID "091070" arrives as EmpID 91070). Lookups try the exact number first,
// then the number without leading zeros when that is unambiguous.

export function employeeNoKey(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase().replace(/^0+(?=\d)/, "");
}

/** Map of employee number → value, keyed by the exact number and by its zero-stripped form. */
export function buildEmployeeMap<T>(items: Array<{ employeeNo: string; value: T }>): Map<string, T> {
  const map = new Map<string, T>();
  for (const i of items) map.set(i.employeeNo.trim().toLowerCase(), i.value);
  const loose = new Map<string, T[]>();
  for (const i of items) {
    const k = `~${employeeNoKey(i.employeeNo)}`;
    loose.set(k, [...(loose.get(k) ?? []), i.value]);
  }
  for (const [k, v] of loose) if (v.length === 1) map.set(k, v[0]);
  return map;
}

export function lookupEmployee<T>(map: Map<string, T>, raw: unknown): T | undefined {
  const exact = String(raw ?? "").trim().toLowerCase();
  if (!exact) return undefined;
  return map.get(exact) ?? map.get(`~${employeeNoKey(exact)}`);
}
