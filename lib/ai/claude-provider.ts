import "server-only";

import type { AIProvider, AIProviderInput, AIProviderOutput } from "@/lib/ai/provider";
import type { ConversationHistoryEntry } from "@/lib/types/forum";

interface AnthropicMessageResponse {
  stop_reason?: string | null;
  content?: Array<{
    type: string;
    text?: string;
  }>;
}

function extractJsonText(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const trimmed = raw.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateClaudeOutput(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!isObject(payload)) {
    return { valid: false, errors: ["Provider output is not an object."] };
  }

  const requiredKeys = [
    "summary",
    "understanding",
    "events",
    "entities",
    "facts",
    "knowledge",
    "reasoning",
    "prioritization",
    "actions",
    "approval_required",
    "replyText",
  ];

  for (const key of requiredKeys) {
    if (!(key in payload)) {
      errors.push(`Missing key: ${key}`);
    }
  }

  if (typeof payload.summary !== "string") {
    errors.push("summary must be a string.");
  }

  if (!isObject(payload.understanding)) {
    errors.push("understanding must be an object.");
  }

  if (!Array.isArray(payload.events)) {
    errors.push("events must be an array.");
  }

  if (!Array.isArray(payload.entities)) {
    errors.push("entities must be an array.");
  }

  if (!Array.isArray(payload.facts)) {
    errors.push("facts must be an array.");
  }

  if (!isObject(payload.knowledge)) {
    errors.push("knowledge must be an object.");
  }

  if (!isObject(payload.reasoning)) {
    errors.push("reasoning must be an object.");
  }

  if (!isObject(payload.prioritization)) {
    errors.push("prioritization must be an object.");
  }

  if (!Array.isArray(payload.actions)) {
    errors.push("actions must be an array.");
  }

  if (typeof payload.approval_required !== "boolean") {
    errors.push("approval_required must be a boolean.");
  }

  if (typeof payload.replyText !== "string") {
    errors.push("replyText must be a string.");
  }

  return { valid: errors.length === 0, errors };
}

function buildCorePrompt(): string[] {
  return [
    "You are FORUM AI Operations Engine.",
    "Analyze the business input and return ONLY one valid JSON object.",
    "Output must start with '{' and end with '}'.",
    "Do not include markdown fences.",
    "Do not include comments.",
    "Do not include explanations.",
    "Do not include any text before or after the JSON object.",
    "Truth and action-state rules are mandatory:",
    "- facts must contain only user-stated facts explicitly present in the input message.",
    "- assumptions or inferences must go only to reasoning.assumptions or knowledge.signals.",
    "- actions are only proposed recommendations, never executed operations.",
    "- replyText must never claim that external actions were completed/saved/sent/scheduled.",
    "- use wording such as proposed, prepared, pending approval, ready to execute.",
    "Return this exact JSON object shape and keys:",
    "{",
    '  "summary": "string",',
    '  "understanding": { "intent": "string", "context": "string", "urgency": "low|medium|high|critical" },',
    '  "events": [{ "type": "string", "title": "string", "details": "string", "occurredAt": "ISO date string" }],',
    '  "entities": [{ "type": "string", "name": "string", "role": "string optional" }],',
    '  "facts": [{ "statement": "string", "confidence": 0.0 }],',
    '  "knowledge": { "opportunity": "string", "constraints": ["string"], "signals": ["string"] },',
    '  "reasoning": { "summary": "string", "steps": ["string"], "assumptions": ["string"] },',
    '  "prioritization": { "level": "low|medium|high|critical", "rationale": "string", "nextFocus": "string" },',
    '  "actions": [{ "type": "string", "title": "string", "description": "string", "dueDate": "ISO date string optional", "requiresApproval": true }],',
    '  "approval_required": true,',
    '  "replyText": "string"',
    "}",
  ];
}

function buildDomainPrompt(businessModel: AIProviderInput["businessModel"]): string[] {
  if (businessModel === "weight_management") {
    return [
      "Domain: Weight Management.",
      "The assistant is a general wellness and behavior-change assistant, not a doctor.",
      "Understand weight measurements, food events, activity, steps, sleep, stress/context explicitly stated by the user, goals explicitly stated by the user, behavioral patterns, progress, questions, and clarification requests.",
      "FACT ≠ INFERENCE.",
      "Never invent weight, calories, meals, medical conditions, goals, history, habits, or behavioral patterns.",
      "Only classify something as a fact if the user explicitly stated it.",
      "When session history is provided, previous user turns from that same session are valid context for interpreting the latest message.",
      "Never treat previous assistant replies as facts.",
      "Never use information from outside the provided session history.",
      "Treat possible links between stress, food, movement, sleep, and progress as signals or assumptions, not facts.",
      "If information is insufficient, respond with a brief reflection plus at most one clarifying question.",
      "Never ask multiple questions at once or format the reply like a questionnaire.",
      "Prefer one focused next-step question that is directly relevant to the user's last message.",
      "Do not diagnose medical or psychological conditions.",
      "Recommended actions are suggestions only and must not be presented as executed.",
      "If the user asks why progress changed, look for missing information about food, movement, sleep, stress, or timing and ask a focused follow-up question if needed.",
    ];
  }

  return [
    "Domain: FORUM.",
    "This domain is for general business operations intelligence.",
    "Keep the existing FORUM business processing behavior and business-language interpretation.",
    "Treat business actions as proposed recommendations only.",
  ];
}

function formatConversationHistory(conversationHistory: ConversationHistoryEntry[]): string[] {
  if (conversationHistory.length === 0) {
    return ["session_history: none"]; 
  }

  return [
    "session_history:",
    ...conversationHistory.map((entry, index) => {
      const reference = entry.role === "user" ? entry.messageId : entry.replyId;
      return `${index + 1}. [${entry.timestamp}] role=${entry.role}${reference ? ` id=${reference}` : ""} content=${JSON.stringify(entry.content)}`;
    }),
  ];
}

function buildPrompt(
  message: string,
  receivedAt: string,
  businessModel: AIProviderInput["businessModel"],
  sessionId?: string,
  conversationHistory: ConversationHistoryEntry[] = [],
  memoryContext?: string,
): string {
  const memorySection = memoryContext ? `memory_context:\n${memoryContext}` : "memory_context: none";

  return [
    ...buildCorePrompt(),
    ...buildDomainPrompt(businessModel),
    "If unsure, use best-effort structured extraction from the message only.",
    "Previous memory is contextual information, not guaranteed truth.",
    "Use memory only when relevant; do not dump it to the user; do not mention internal memory structure.",
    "User-stated memory may be referenced as previously stated.",
    "AI-inferred patterns must be presented cautiously and never promoted to facts.",
    "If memory conflicts with the current user statement, trust the current user statement.",
    sessionId ? `session_id: ${sessionId}` : "session_id: none",
    ...formatConversationHistory(conversationHistory),
    memorySection,
    `receivedAt: ${receivedAt}`,
    `latest_message: ${message}`,
  ].join("\n");
}

export class ClaudeAIProvider implements AIProvider {
  readonly name = "claude-api-provider";

  async process(input: AIProviderInput): Promise<AIProviderOutput> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("PROCESSING_FAILED:ANTHROPIC_API_KEY is not set.");
    }

    const model = process.env.FORUM_CLAUDE_MODEL ?? "claude-3-7-sonnet-latest";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: buildPrompt(
              input.message,
              input.receivedAt,
              input.businessModel,
              input.sessionId,
              input.conversationHistory,
              input.memoryContext,
            ),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`PROCESSING_FAILED:Claude API request failed (${response.status}): ${errBody}`);
    }

    const data = (await response.json()) as AnthropicMessageResponse;
    const textChunk = data.content?.find((item) => item.type === "text" && typeof item.text === "string")?.text;

    if (!textChunk) {
      throw new Error("INVALID_AI_OUTPUT:Claude response did not contain text content.");
    }

    if (data.stop_reason === "max_tokens") {
      throw new Error("INVALID_AI_OUTPUT:Claude output was truncated because maximum output token limit was reached (stop_reason=max_tokens).");
    }

    const jsonText = extractJsonText(textChunk);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("INVALID_AI_OUTPUT:Claude response was not valid JSON.");
    }

    const validation = validateClaudeOutput(parsed);
    if (!validation.valid) {
      throw new Error(`INVALID_AI_OUTPUT:${validation.errors.join(" | ")}`);
    }

    return parsed as AIProviderOutput;
  }
}
