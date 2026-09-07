import { MemoryCorruptionError, MemoryValidationError } from "./memory-errors";
import type { StoreSnapshot, UserWeightMemory } from "./memory-types";

const MEMORY_SNAPSHOT_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMemoryItem(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.id === "string"
    && typeof value.statement === "string"
    && typeof value.confidence === "number"
    && typeof value.status === "string"
    && typeof value.createdAt === "string"
    && typeof value.updatedAt === "string";
}

function isRecentContext(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.updatedAt === "string";
}

function isUserMemory(value: unknown): value is UserWeightMemory {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.userId === "string"
    && Array.isArray(value.facts)
    && Array.isArray(value.goals)
    && Array.isArray(value.patterns)
    && isRecentContext(value.recentContext)
    && typeof value.updatedAt === "string"
    && value.facts.every(isMemoryItem)
    && value.goals.every(isMemoryItem)
    && value.patterns.every(isMemoryItem);
}

export function normalizeStoreMap(value: unknown): Record<string, UserWeightMemory> {
  if (!isRecord(value)) {
    throw new MemoryValidationError("Store root must be an object.", { valueType: typeof value });
  }

  const snapshot = value as Record<string, unknown>;
  const body = Object.prototype.hasOwnProperty.call(snapshot, "store") && isRecord(snapshot.store)
    ? snapshot.store as Record<string, unknown>
    : snapshot;

  const result: Record<string, UserWeightMemory> = {};
  for (const [userId, entry] of Object.entries(body)) {
    if (!isUserMemory(entry)) {
      throw new MemoryValidationError(`Invalid memory entry for user ${String(userId)}.`, { userId });
    }
    result[userId] = entry;
  }

  return result;
}

export function serializeStoreMap(store: Record<string, UserWeightMemory>, updatedAt?: string): string {
  const snapshot: StoreSnapshot = {
    version: MEMORY_SNAPSHOT_VERSION,
    store,
    updatedAt: updatedAt ?? new Date().toISOString(),
  };

  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function parseStoreText(raw: string, filePath: string, operation: string): Record<string, UserWeightMemory> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = /position\s+(\d+)/i.exec(message);
    throw new MemoryCorruptionError(`${operation} failed: invalid JSON in memory store.`, {
      filePath,
      operation,
      position: match ? Number(match[1]) : null,
      error: message,
      timestamp: new Date().toISOString(),
    });
  }

  try {
    return normalizeStoreMap(parsed);
  } catch (error) {
    if (error instanceof MemoryCorruptionError || error instanceof MemoryValidationError) {
      throw error;
    }
    throw new MemoryValidationError(`Store validation failed during ${operation}.`, {
      filePath,
      operation,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
