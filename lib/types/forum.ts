export type ProcessingState = "waiting" | "processing" | "completed" | "error";

export type PriorityLevel = "low" | "medium" | "high" | "critical";

export type BusinessModel = "forum" | "weight_management";

export type ConversationRole = "user" | "assistant";

export interface ConversationHistoryEntry {
  role: ConversationRole;
  content: string;
  timestamp: string;
  messageId?: string;
  replyId?: string;
}

export interface HumanReadableRef {
  technicalId: string;
  humanId: string;
}

export interface ConversationRef extends HumanReadableRef {
  conversationId: string;
}

export interface MessageRef extends HumanReadableRef {
  messageId: string;
  conversationId: string;
}

export interface ReplyRef extends HumanReadableRef {
  replyId: string;
  conversationId: string;
  messageId: string;
}

export interface ForumEvent {
  technicalId: string;
  eventId: string;
  conversationId: string;
  messageId: string;
  type: string;
  title: string;
  occurredAt: string;
  details: string;
}

export interface ForumEntity {
  type: string;
  name: string;
  role?: string;
}

export interface ForumFact {
  factId: string;
  conversationId: string;
  messageId: string;
  statement: string;
  confidence: number;
}

export interface ForumAction {
  technicalId: string;
  actionId: string;
  conversationId: string;
  messageId: string;
  replyId: string;
  type: string;
  title: string;
  description: string;
  dueDate?: string;
  requiresApproval: boolean;
  status: "proposed";
}

export interface ForumLogEntry {
  timestamp: string;
  status: ProcessingState;
  stage: "INPUT" | "AI PROCESSING" | "JSON" | "WORKSPACE";
  message: string;
}

export interface ForumStructuredResult {
  summary: string;
  input: {
    conversation: ConversationRef;
    message: MessageRef & {
      content: string;
      receivedAt: string;
      channel: string;
    };
  };
  understanding: {
    intent: string;
    context: string;
    urgency: PriorityLevel;
  };
  events: ForumEvent[];
  entities: ForumEntity[];
  facts: ForumFact[];
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
    level: PriorityLevel;
    rationale: string;
    nextFocus: string;
  };
  actions: ForumAction[];
  approval_required: boolean;
  approval: {
    status: "not_required" | "pending";
    items: Array<{
      actionId: string;
      reason: string;
    }>;
  };
  reply: ReplyRef & {
    text: string;
  };
  processing: {
    status: "completed" | "failed";
    provider: string;
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
  promptVersion: string;
  logs: ForumLogEntry[];
  conversation_output: {
    conversationId: string;
    messageId: string;
    replyId: string;
    eventIds: string[];
    actionIds: string[];
  };
}

export interface ProcessRequestBody {
  message: string;
  businessModel?: BusinessModel;
  userId?: string;
  sessionId?: string;
  conversationHistory?: ConversationHistoryEntry[];
}

export interface ProcessErrorResult {
  error: {
    code: "EMPTY_INPUT" | "INVALID_AI_OUTPUT" | "MALFORMED_JSON" | "PROCESSING_FAILED";
    message: string;
    details?: string[];
  };
  processing: {
    status: "failed";
    logs: ForumLogEntry[];
  };
}
