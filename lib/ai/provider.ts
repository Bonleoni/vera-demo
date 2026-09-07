import type { BusinessModel, ConversationHistoryEntry } from "@/lib/types/forum";

export interface AIProviderInput {
  message: string;
  receivedAt: string;
  businessModel: BusinessModel;
  userId?: string;
  sessionId?: string;
  conversationHistory?: ConversationHistoryEntry[];
  memoryContext?: string;
}

export interface AIProviderDraftEvent {
  type: string;
  title: string;
  details: string;
  occurredAt: string;
}

export interface AIProviderDraftAction {
  type: string;
  title: string;
  description: string;
  dueDate?: string;
  requiresApproval: boolean;
}

export interface AIProviderOutput {
  summary: string;
  understanding: {
    intent: string;
    context: string;
    urgency: "low" | "medium" | "high" | "critical";
  };
  events: AIProviderDraftEvent[];
  entities: Array<{
    type: string;
    name: string;
    role?: string;
  }>;
  facts: Array<{
    statement: string;
    confidence: number;
  }>;
  knowledge: {
    opportunity: string;
    constraints: string[];
    signals: string[];
  };
  reasoning: {
    summary: string;
    steps: string[];
    assumptions: string[];
  };
  prioritization: {
    level: "low" | "medium" | "high" | "critical";
    rationale: string;
    nextFocus: string;
  };
  actions: AIProviderDraftAction[];
  approval_required: boolean;
  replyText: string;
}

export interface AIProvider {
  readonly name: string;
  process(input: AIProviderInput): Promise<AIProviderOutput>;
}
