export type MemoryStatus = "user-stated" | "ai-inference";

export interface MemoryItemBase {
  id: string;
  statement: string;
  sourceSessionId?: string;
  sourceMessageId?: string;
  confidence: number;
  status: MemoryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UserMemoryFact extends MemoryItemBase {
  status: "user-stated";
}

export interface UserMemoryGoal extends MemoryItemBase {
  status: "user-stated";
}

export interface UserMemoryPattern extends MemoryItemBase {
  status: "ai-inference";
}

export interface UserMemoryRecentContext {
  lastSessionId?: string;
  lastMessageAt?: string;
  lastUserMessage?: string;
  summary?: string;
  updatedAt: string;
}

export interface UserWeightMemory {
  userId: string;
  facts: UserMemoryFact[];
  goals: UserMemoryGoal[];
  patterns: UserMemoryPattern[];
  recentContext: UserMemoryRecentContext;
  updatedAt: string;
}

export interface MemoryHealth {
  healthy: boolean;
  exists: boolean;
  readable: boolean;
  valid: boolean;
  recoverable: boolean;
  bytes: number;
  updatedAt?: string;
  path: string;
  lastError?: string;
}

export interface MemoryStoreOptions {
  dataDir?: string;
  fileName?: string;
  productionPath?: string;
  allowProduction?: boolean;
}

export interface StoreSnapshot {
  version: number;
  store: Record<string, UserWeightMemory>;
  updatedAt: string;
}
