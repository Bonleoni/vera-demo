export type IdPrefix = "FRM" | "MSG" | "AIR" | "EVT" | "ACT";

const counters: Record<IdPrefix, number> = {
  FRM: 0,
  MSG: 0,
  AIR: 0,
  EVT: 0,
  ACT: 0,
};

export function generateHumanReadableId(prefix: IdPrefix): string {
  counters[prefix] += 1;
  return `${prefix}-${String(counters[prefix]).padStart(7, "0")}`;
}

export function generateTechnicalId(): string {
  return crypto.randomUUID();
}
