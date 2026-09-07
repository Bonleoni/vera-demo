import { NextResponse } from "next/server";

import { processForumMessage } from "@/lib/pipeline/process-message";
import type {
  ConversationHistoryEntry,
  ProcessErrorResult,
  ProcessRequestBody,
} from "@/lib/types/forum";

function normalizeConversationHistoryEntry(entry: unknown): ConversationHistoryEntry | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }

  const candidate = entry as Record<string, unknown>;
  const role = candidate.role;
  const content = candidate.content;
  const timestamp = candidate.timestamp;

  if ((role !== "user" && role !== "assistant") || typeof content !== "string" || typeof timestamp !== "string") {
    return null;
  }

  return {
    role,
    content,
    timestamp,
    messageId: typeof candidate.messageId === "string" ? candidate.messageId : undefined,
    replyId: typeof candidate.replyId === "string" ? candidate.replyId : undefined,
  };
}

function errorResponse(
  code: ProcessErrorResult["error"]["code"],
  message: string,
  details?: string[],
  status = 400,
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details,
      },
      processing: {
        status: "failed",
        logs: [
          {
            timestamp: new Date().toISOString(),
            status: "error",
            stage: "INPUT",
            message,
          },
        ],
      },
    } satisfies ProcessErrorResult,
    { status },
  );
}

export async function POST(request: Request) {
  let body: ProcessRequestBody;

  try {
    body = (await request.json()) as ProcessRequestBody;
  } catch {
    return errorResponse("MALFORMED_JSON", "Request body must be valid JSON.", undefined, 400);
  }

  if (!body.message || typeof body.message !== "string" || body.message.trim().length === 0) {
    return errorResponse("EMPTY_INPUT", "Message is required.", undefined, 400);
  }

  const businessModel = body.businessModel === "weight_management" ? "weight_management" : "forum";
  const userId = typeof body.userId === "string" && body.userId.trim().length > 0
    ? body.userId.trim()
    : undefined;
  const sessionId = typeof body.sessionId === "string" && body.sessionId.trim().length > 0
    ? body.sessionId.trim()
    : undefined;

  const conversationHistory = Array.isArray(body.conversationHistory)
    ? body.conversationHistory
        .map((entry) => normalizeConversationHistoryEntry(entry))
        .filter((entry): entry is ConversationHistoryEntry => entry !== null)
    : [];

  try {
    const result = await processForumMessage(body.message.trim(), businessModel, {
      userId,
      sessionId,
      conversationHistory,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("INVALID_AI_OUTPUT:")) {
      const details = error.message.replace("INVALID_AI_OUTPUT:", "").split(" | ");
      return errorResponse(
        "INVALID_AI_OUTPUT",
        "AI output validation failed.",
        details,
        422,
      );
    }

    return errorResponse("PROCESSING_FAILED", "Unexpected processing error.", undefined, 500);
  }
}
