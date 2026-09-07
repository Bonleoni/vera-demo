import type { ForumStructuredResult } from "@/lib/types/forum";

const ID_PATTERNS = {
  FRM: /^FRM-\d{7}$/,
  MSG: /^MSG-\d{7}$/,
  AIR: /^AIR-\d{7}$/,
  EVT: /^EVT-\d{7}$/,
  ACT: /^ACT-\d{7}$/,
};

const REQUIRED_KEYS: Array<keyof ForumStructuredResult> = [
  "summary",
  "input",
  "understanding",
  "events",
  "entities",
  "facts",
  "knowledge",
  "reasoning",
  "prioritization",
  "actions",
  "approval_required",
  "approval",
  "reply",
  "processing",
  "promptVersion",
  "logs",
  "conversation_output",
];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateForumResult(payload: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(payload)) {
    return { valid: false, errors: ["Result is not an object."] };
  }

  for (const key of REQUIRED_KEYS) {
    if (!(key in payload)) {
      errors.push(`Missing required key: ${key}`);
    }
  }

  if (typeof payload.summary !== "string") {
    errors.push("summary must be a string.");
  }

  if (!isObject(payload.input) || !isObject(payload.input.conversation) || !isObject(payload.input.message)) {
    errors.push("input.conversation and input.message must be objects.");
  } else {
    const conversationId = payload.input.conversation.conversationId;
    const messageId = payload.input.message.messageId;

    if (typeof conversationId !== "string" || !ID_PATTERNS.FRM.test(conversationId)) {
      errors.push("conversationId must match FRM-0000000 format.");
    }

    if (typeof messageId !== "string" || !ID_PATTERNS.MSG.test(messageId)) {
      errors.push("messageId must match MSG-0000000 format.");
    }
  }

  if (!Array.isArray(payload.events)) {
    errors.push("events must be an array.");
  } else {
    for (const event of payload.events) {
      if (!isObject(event) || typeof event.eventId !== "string" || !ID_PATTERNS.EVT.test(event.eventId)) {
        errors.push("Each event must contain a valid EVT identifier.");
        break;
      }
    }
  }

  if (!Array.isArray(payload.actions)) {
    errors.push("actions must be an array.");
  } else {
    for (const action of payload.actions) {
      if (!isObject(action) || typeof action.actionId !== "string" || !ID_PATTERNS.ACT.test(action.actionId)) {
        errors.push("Each action must contain a valid ACT identifier.");
        break;
      }
    }
  }

  if (!isObject(payload.reply) || typeof payload.reply.replyId !== "string" || !ID_PATTERNS.AIR.test(payload.reply.replyId)) {
    errors.push("reply.replyId must match AIR-0000000 format.");
  }

  if (!Array.isArray(payload.logs)) {
    errors.push("logs must be an array.");
  }

  return { valid: errors.length === 0, errors };
}
