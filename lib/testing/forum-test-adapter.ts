import { processForumMessage } from "@/lib/pipeline/process-message";
import { evaluateConversationState } from "@/lib/conversation/insight-engine";
import type { ForumStructuredResult } from "@/lib/types/forum";
import type { TestTurn } from "@/lib/testing/test-types";

export interface RunForumTurnInput {
  message: string;
  businessModel: "weight_management";
  userId: string;
  sessionId: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string; timestamp: string; messageId?: string; replyId?: string }>;
  testMode?: "MOCK" | "LIVE";
}

export async function runForumTurn(input: RunForumTurnInput): Promise<{ result: ForumStructuredResult; state: string; replyStrategy: string; confidence: number; insight: string | null; }> {
  const result = await processForumMessage(input.message, input.businessModel, {
    userId: input.userId,
    sessionId: input.sessionId,
    conversationHistory: input.conversationHistory,
  });

  const stateSnapshot = evaluateConversationState(input.conversationHistory, result.knowledge.signals ?? []);

  return {
    result,
    state: stateSnapshot.state,
    replyStrategy: stateSnapshot.replyStrategy,
    confidence: stateSnapshot.insight.confidence,
    insight: stateSnapshot.insight.summary,
  };
}

export function mapTurnToTrace(input: {
  turnNumber: number;
  userId: string;
  sessionId: string;
  userMessage: string;
  forumReply: string;
  forumResult: ForumStructuredResult | null;
  conversationState: string;
  replyStrategy: string;
  confidence: number;
  insight: string | null;
  sessionDecision: TestTurn["sessionDecision"];
  simulatedUser: TestTurn["simulatedUser"];
  assertions: TestTurn["assertions"];
  errors: string[];
}): TestTurn {
  return {
    turnNumber: input.turnNumber,
    timestamp: new Date().toISOString(),
    userId: input.userId,
    sessionId: input.sessionId,
    userMessage: input.userMessage,
    forumReply: input.forumReply,
    forumResult: input.forumResult,
    conversationState: input.conversationState,
    replyStrategy: input.replyStrategy,
    confidence: input.confidence,
    insight: input.insight,
    sessionDecision: input.sessionDecision,
    simulatedUser: input.simulatedUser,
    assertions: input.assertions,
    errors: input.errors,
  };
}
