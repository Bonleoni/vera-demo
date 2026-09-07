import type { AIProvider } from "@/lib/ai/provider";
import { resolveAIProvider } from "@/lib/ai/provider-factory";
import {
  generateHumanReadableId,
  generateTechnicalId,
} from "@/lib/ids/id-generator";
import { evaluateConversationState } from "@/lib/conversation/insight-engine";
import { buildMemoryContext } from "@/lib/memory/retriever";
import { getUserMemory, updateUserMemoryFromResult } from "@/lib/memory/store";
import type { BusinessModel, ConversationHistoryEntry } from "@/lib/types/forum";
import type {
  ForumAction,
  ForumEvent,
  ForumFact,
  ForumLogEntry,
  ForumStructuredResult,
  ProcessingState,
} from "@/lib/types/forum";
import { validateForumResult } from "@/lib/validation/forum-result";

function createLog(
  logs: ForumLogEntry[],
  stage: ForumLogEntry["stage"],
  status: ProcessingState,
  message: string,
): void {
  logs.push({
    timestamp: new Date().toISOString(),
    stage,
    status,
    message,
  });
}

interface ProcessForumMessageContext {
  userId?: string;
  sessionId?: string;
  conversationHistory?: ConversationHistoryEntry[];
}

export async function processForumMessage(
  message: string,
  businessModel: BusinessModel = "forum",
  context: ProcessForumMessageContext = {},
  provider?: AIProvider,
): Promise<ForumStructuredResult> {
  const activeProvider = provider ?? resolveAIProvider();
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();
  const logs: ForumLogEntry[] = [];

  createLog(logs, "INPUT", "completed", "Input received");
  createLog(logs, "AI PROCESSING", "processing", "AI processing started");

  const conversationId = generateHumanReadableId("FRM");
  const messageId = generateHumanReadableId("MSG");
  const replyId = generateHumanReadableId("AIR");

  let memoryContext: string | undefined;
  if (businessModel === "weight_management" && context.userId) {
    const memory = await getUserMemory(context.userId);
    memoryContext = buildMemoryContext(
      memory,
      message,
      context.conversationHistory ?? [],
    );
  }

  const aiResult = await activeProvider.process({
    message,
    receivedAt: startedAt,
    businessModel,
    userId: context.userId,
    sessionId: context.sessionId,
    conversationHistory: context.conversationHistory ?? [],
    memoryContext,
  });

  createLog(logs, "AI PROCESSING", "completed", "AI processing completed");

  const events: ForumEvent[] = aiResult.events.map((event) => ({
    technicalId: generateTechnicalId(),
    eventId: generateHumanReadableId("EVT"),
    conversationId,
    messageId,
    type: event.type,
    title: event.title,
    occurredAt: event.occurredAt,
    details: event.details,
  }));

  const actions: ForumAction[] = aiResult.actions.map((action) => ({
    technicalId: generateTechnicalId(),
    actionId: generateHumanReadableId("ACT"),
    conversationId,
    messageId,
    replyId,
    type: action.type,
    title: action.title,
    description: action.description,
    dueDate: action.dueDate,
    requiresApproval: action.requiresApproval,
    status: "proposed",
  }));

  const facts: ForumFact[] = aiResult.facts.map((fact, index) => ({
    factId: `FAC-${String(index + 1).padStart(7, "0")}`,
    conversationId,
    messageId,
    statement: fact.statement,
    confidence: fact.confidence,
  }));

  const completedAtDate = new Date();
  const completedAt = completedAtDate.toISOString();

  const result: ForumStructuredResult = {
    summary: aiResult.summary,
    input: {
      conversation: {
        technicalId: generateTechnicalId(),
        humanId: conversationId,
        conversationId,
      },
      message: {
        technicalId: generateTechnicalId(),
        humanId: messageId,
        messageId,
        conversationId,
        content: message,
        receivedAt: startedAt,
        channel: "manual_input",
      },
    },
    understanding: aiResult.understanding,
    events,
    entities: aiResult.entities,
    facts,
    knowledge: aiResult.knowledge,
    reasoning: aiResult.reasoning,
    prioritization: aiResult.prioritization,
    actions,
    approval_required: aiResult.approval_required,
    approval: {
      status: aiResult.approval_required ? "pending" : "not_required",
      items: actions
        .filter((action) => action.requiresApproval)
        .map((action) => ({
          actionId: action.actionId,
          reason: "Action is marked as requiring human approval before execution.",
        })),
    },
    reply: {
      technicalId: generateTechnicalId(),
      humanId: replyId,
      replyId,
      conversationId,
      messageId,
      text: aiResult.replyText,
    },
    processing: {
      status: "completed",
      provider: activeProvider.name,
      startedAt,
      completedAt,
      durationMs: completedAtDate.getTime() - startedAtDate.getTime(),
    },
    promptVersion: "forum-core-v1.0",
    logs,
    conversation_output: {
      conversationId,
      messageId,
      replyId,
      eventIds: events.map((event) => event.eventId),
      actionIds: actions.map((action) => action.actionId),
    },
  };

  const validation = validateForumResult(result);

  if (!validation.valid) {
    createLog(logs, "JSON", "error", "JSON validation failed");
    throw new Error(`INVALID_AI_OUTPUT:${validation.errors.join(" | ")}`);
  }

  createLog(logs, "JSON", "completed", "JSON validated");

  if (businessModel === "weight_management") {
    const sessionMessages = context.conversationHistory ?? [];
    const stateSnapshot = evaluateConversationState(sessionMessages, result.knowledge.signals ?? []);
    createLog(
      logs,
      "WORKSPACE",
      "completed",
      `Conversation state: ${stateSnapshot.state}; replyStrategy: ${stateSnapshot.replyStrategy}; insightReady: ${stateSnapshot.insight.ready ? "yes" : "no"}`,
    );

    if (context.userId) {
      try {
        await updateUserMemoryFromResult(context.userId, result, {
          sessionId: context.sessionId,
          message,
        });
        createLog(logs, "WORKSPACE", "completed", "User memory updated");
      } catch {
        createLog(logs, "WORKSPACE", "error", "User memory update failed");
      }
    }
  }

  createLog(logs, "WORKSPACE", "completed", "Workspace rendered");

  return result;
}
