import { MemoryCorruptionError, MemoryPersistenceError, MemoryValidationError } from "./memory-errors";
import { parseStoreText, serializeStoreMap } from "./memory-serializer";
import { MemoryPersistenceAdapter } from "./memory-persistence";
import type { MemoryHealth, MemoryStoreOptions, UserWeightMemory } from "./memory-types";

export interface MemoryStore {
  get(userId: string): Promise<UserWeightMemory | null>;
  readAll(): Promise<Record<string, UserWeightMemory>>;
  writeAll(store: Record<string, UserWeightMemory>): Promise<void>;
  update(userId: string, updater: (memory: UserWeightMemory) => UserWeightMemory): Promise<UserWeightMemory>;
  replace(userId: string, memory: UserWeightMemory): Promise<UserWeightMemory>;
  remove(userId: string): Promise<void>;
  health(): Promise<MemoryHealth>;
}

export class MemoryJsonStore implements MemoryStore {
  private readonly adapter: MemoryPersistenceAdapter;

  constructor(options: MemoryStoreOptions = {}) {
    this.adapter = new MemoryPersistenceAdapter(options);
  }

  async get(userId: string): Promise<UserWeightMemory | null> {
    if (!userId || !userId.trim()) {
      throw new MemoryValidationError("User identifier is required.", { userId });
    }

    const store = await this.adapter.read();
    return store[userId.trim()] ?? null;
  }

  async readAll(): Promise<Record<string, UserWeightMemory>> {
    return this.adapter.read();
  }

  async writeAll(store: Record<string, UserWeightMemory>): Promise<void> {
    await this.adapter.write(store);
  }

  async update(userId: string, updater: (memory: UserWeightMemory) => UserWeightMemory): Promise<UserWeightMemory> {
    if (!userId || !userId.trim()) {
      throw new MemoryValidationError("User identifier is required.", { userId });
    }

    const trimmed = userId.trim();

    return this.adapter.mutate((store) => {
      const existing = store[trimmed] ?? this.createEmptyMemory(trimmed);
      const next = updater(existing);

      if (!next || typeof next !== "object") {
        throw new MemoryValidationError(
          "Memory updater must return a valid memory object.",
          { userId: trimmed }
        );
      }

      store[trimmed] = next;
      return next;
    });
  }

  async replace(userId: string, memory: UserWeightMemory): Promise<UserWeightMemory> {
    if (!userId || !userId.trim()) {
      throw new MemoryValidationError("User identifier is required.", { userId });
    }

    const trimmed = userId.trim();
    const next = {
      ...memory,
      userId: trimmed,
    };

    return this.adapter.mutate((store) => {
      store[trimmed] = next;
      return next;
    });
  }

  async remove(userId: string): Promise<void> {
    if (!userId || !userId.trim()) {
      throw new MemoryValidationError("User identifier is required.", { userId });
    }

    const trimmed = userId.trim();

    await this.adapter.mutate((store) => {
      delete store[trimmed];
    });
  }

  async health(): Promise<MemoryHealth> {
    return this.adapter.getHealth();
  }

  private createEmptyMemory(userId: string): UserWeightMemory {
    const timestamp = new Date().toISOString();
    return {
      userId,
      facts: [],
      goals: [],
      patterns: [],
      recentContext: { updatedAt: timestamp },
      updatedAt: timestamp,
    };
  }
}

export const memoryStore = new MemoryJsonStore({
  dataDir: process.env.MEMORY_DATA_DIR ?? "D:/TEMP/forum-memory-v2",
  productionPath: "D:/FORUM/forum-core-v1/data/weight-management-memory.json",
  allowProduction: false,
});

export function createMemoryStore(options: MemoryStoreOptions = {}): MemoryJsonStore {
  return new MemoryJsonStore(options);
}

export function getMemoryStore(): MemoryJsonStore {
  return memoryStore;
}

export function parseStoreJson(raw: string, filePath: string, operation: string) {
  return parseStoreText(raw, filePath, operation);
}

export function serializeStoreJson(store: Record<string, UserWeightMemory>, updatedAt?: string): string {
  return serializeStoreMap(store, updatedAt);
}
