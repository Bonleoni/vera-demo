import type { ForumStructuredResult } from "@/lib/types/forum";

import { MemoryCorruptionError, MemoryValidationError } from "./memory-errors";
import { MemoryJsonStore, createMemoryStore, getMemoryStore } from "./memory-store";
import type { UserMemoryFact, UserMemoryGoal, UserMemoryPattern, UserWeightMemory } from "./memory-types";

const DEFAULT_MEMORY_STORE = createMemoryStore({
  dataDir: process.env.MEMORY_DATA_DIR ?? "D:/TEMP/forum-memory-v2",
  productionPath: "D:/FORUM/forum-core-v1/data/weight-management-memory.json",
  allowProduction: false,
});

function createEmptyMemory(userId: string): UserWeightMemory {
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

function sanitizeStatement(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function hasDuplicateStatement<T extends { statement: string }>(items: T[], statement: string): boolean {
  const normalized = sanitizeStatement(statement).toLowerCase();
  return items.some((item) => sanitizeStatement(item.statement).toLowerCase() === normalized);
}

export async function readStore(): Promise<Record<string, UserWeightMemory>> {
  try {
    return await DEFAULT_MEMORY_STORE.readAll();
  } catch (error) {
    if (error instanceof MemoryCorruptionError) {
      throw error;
    }
    return {};
  }
}

export async function writeStore(store: Record<string, UserWeightMemory>): Promise<void> {
  await DEFAULT_MEMORY_STORE.writeAll(store);
}

export async function getUserMemory(userId: string): Promise<UserWeightMemory> {
  if (!userId || !userId.trim()) {
    throw new MemoryValidationError("USER_ID_REQUIRED", { userId });
  }

  const result = await DEFAULT_MEMORY_STORE.get(userId.trim());
  return result ?? createEmptyMemory(userId.trim());
}

export async function saveUserMemory(memory: UserWeightMemory): Promise<UserWeightMemory> {
  return DEFAULT_MEMORY_STORE.replace(memory.userId, memory);
}

export async function updateUserMemoryFromResult(
  userId: string,
  result: ForumStructuredResult,
  options: {
    sessionId?: string;
    message?: string;
  } = {},
): Promise<UserWeightMemory> {
  const memory = await getUserMemory(userId);
  const now = new Date().toISOString();

  for (const fact of result.facts) {
    const statement = sanitizeStatement(fact.statement);
    if (!statement) {
      continue;
    }

    const entry: UserMemoryFact = {
      id: fact.factId,
      statement,
      sourceSessionId: options.sessionId,
      sourceMessageId: fact.messageId,
      confidence: fact.confidence,
      status: "user-stated",
      createdAt: now,
      updatedAt: now,
    };

    if (!hasDuplicateStatement(memory.facts, statement)) {
      memory.facts.push(entry);
    }
  }

  const messageIntent = sanitizeStatement(result.understanding.intent || "");
  const explicitGoalSignal = /goal|want|trying|need|aim|plan|focus/i.test(messageIntent);
  if (explicitGoalSignal) {
    const goalStatement = sanitizeStatement(`User goal: ${result.understanding.intent}`);
    if (goalStatement && !hasDuplicateStatement(memory.goals, goalStatement)) {
      const entry: UserMemoryGoal = {
        id: `GOAL-${Date.now()}`,
        statement: goalStatement,
        sourceSessionId: options.sessionId,
        sourceMessageId: result.input.message.messageId,
        confidence: 0.9,
        status: "user-stated",
        createdAt: now,
        updatedAt: now,
      };
      memory.goals.push(entry);
    }
  }

  for (const signal of result.knowledge.signals) {
    const statement = sanitizeStatement(signal);
    if (!statement || hasDuplicateStatement(memory.patterns, statement)) {
      continue;
    }

    const entry: UserMemoryPattern = {
      id: `PAT-${Date.now()}-${memory.patterns.length}`,
      statement,
      sourceSessionId: options.sessionId,
      sourceMessageId: result.input.message.messageId,
      confidence: 0.65,
      status: "ai-inference",
      createdAt: now,
      updatedAt: now,
    };

    memory.patterns.push(entry);
  }

  memory.recentContext = {
    lastSessionId: options.sessionId ?? memory.recentContext.lastSessionId,
    lastMessageAt: result.processing.completedAt,
    lastUserMessage: options.message ?? memory.recentContext.lastUserMessage,
    summary: sanitizeStatement(result.summary || memory.recentContext.summary || ""),
    updatedAt: now,
  };

  memory.updatedAt = now;
  return saveUserMemory(memory);
}

export { createMemoryStore, getMemoryStore, MemoryJsonStore };
export type { UserMemoryFact, UserMemoryGoal, UserMemoryPattern, UserWeightMemory } from "./memory-types";
