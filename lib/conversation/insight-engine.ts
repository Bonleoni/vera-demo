import type { ConversationHistoryEntry } from "@/lib/types/forum";

export type ConversationState =
  | "DISCOVERY"
  | "PATTERN_EMERGING"
  | "INSIGHT_READY"
  | "INSIGHT_DELIVERED"
  | "INTERVENTION"
  | "FOLLOW_UP";

export type ReplyStrategy = "CLARIFY" | "VALIDATE_PATTERN" | "DELIVER_INSIGHT" | "INTERVENTION" | "FOLLOW_UP";

export interface ConversationStateSnapshot {
  state: ConversationState;
  insight: {
    ready: boolean;
    summary: string | null;
    evidenceMessageIds: string[];
    confidence: number;
  };
  replyStrategy: ReplyStrategy;
}

const triggerKeywords = [
  "eve",
  "evening",
  "after work",
  "arrive home",
  "when i get home",
  "home",
  "after i get home",
  "after arriving",
  "night",
  "before bed",
  "change clothes",
  "dinner",
  "snack",
  "late",
  "stress",
  "tired",
  "hungry",
  "habit",
];

const acceptanceKeywords = [
  "yes",
  "yeah",
  "exactly",
  "that's it",
  "same",
  "correct",
  "right",
  "i agree",
  "yes exactly",
];

const rejectionKeywords = [
  "no",
  "not really",
  "not quite",
  "nope",
  "that's not it",
  "actually no",
  "wrong",
];

const followUpKeywords = [
  "how did it go",
  "what happened",
  "did it help",
  "today",
  "after trying",
  "trial",
  "this week",
];

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function getTriggerEvidence(messages: ConversationHistoryEntry[]): string[] {
  const userTexts = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .filter(Boolean);

  const evidence: string[] = [];

  for (const text of userTexts) {
    const normalized = normalizeText(text);
    for (const keyword of triggerKeywords) {
      if (normalized.includes(keyword)) {
        evidence.push(keyword);
        break;
      }
    }
  }

  return Array.from(new Set(evidence));
}

function getInsightSummary(messages: ConversationHistoryEntry[], triggerEvidence: string[]): string | null {
  const userMessages = messages.filter((message) => message.role === "user");
  if (userMessages.length < 2 || triggerEvidence.length === 0) {
    return null;
  }

  const triggerText = triggerEvidence.slice(0, 2).join(" / ");
  return `The pattern seems to be around the transition into the evening routine, especially when ${triggerText} is involved, rather than the food itself alone.`;
}

function isAssistantInsightReply(messages: ConversationHistoryEntry[]): boolean {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  if (!lastAssistant) {
    return false;
  }

  const normalized = normalizeText(lastAssistant.content);
  return /(pattern|it seems|seems|like|might be|feels like|this might be)/i.test(normalized);
}

export function evaluateConversationState(
  messages: ConversationHistoryEntry[],
  signals: string[] = [],
): ConversationStateSnapshot {
  const userMessages = messages.filter((message) => message.role === "user");
  const currentText = userMessages.at(-1)?.content ?? "";
  const normalizedCurrent = normalizeText(currentText);
  const triggerEvidence = getTriggerEvidence(messages);
  const combinedSignals = [...triggerEvidence, ...signals].filter(Boolean);
  const insightSummary = getInsightSummary(messages, combinedSignals.length > 0 ? combinedSignals : triggerEvidence) ??
    (combinedSignals.length > 0 ? `The pattern is becoming clearer around these signals: ${combinedSignals.slice(0, 2).join(" / ")}.` : null);

  const hasPatternEvidence = userMessages.length >= 2 && (triggerEvidence.length > 0 || signals.length > 0);
  const insightReady = hasPatternEvidence && userMessages.length >= 2 && insightSummary !== null;

  const lastAssistantInsight = isAssistantInsightReply(messages);
  const userAcceptedInsight = acceptanceKeywords.some((keyword) => normalizedCurrent.includes(keyword));
  const userRejectedInsight = rejectionKeywords.some((keyword) => normalizedCurrent.includes(keyword));
  const needsFollowUp = followUpKeywords.some((keyword) => normalizedCurrent.includes(keyword));

  let state: ConversationState = "DISCOVERY";
  let replyStrategy: ReplyStrategy = "CLARIFY";

  if (needsFollowUp) {
    state = "FOLLOW_UP";
    replyStrategy = "FOLLOW_UP";
  } else if (userAcceptedInsight && lastAssistantInsight) {
    state = "INTERVENTION";
    replyStrategy = "INTERVENTION";
  } else if (userRejectedInsight && lastAssistantInsight) {
    state = "PATTERN_EMERGING";
    replyStrategy = "VALIDATE_PATTERN";
  } else if (lastAssistantInsight) {
    state = "INSIGHT_DELIVERED";
    replyStrategy = "DELIVER_INSIGHT";
  } else if (insightReady) {
    state = "INSIGHT_READY";
    replyStrategy = "DELIVER_INSIGHT";
  } else if (hasPatternEvidence) {
    state = "PATTERN_EMERGING";
    replyStrategy = "VALIDATE_PATTERN";
  } else {
    state = "DISCOVERY";
    replyStrategy = "CLARIFY";
  }

  return {
    state,
    insight: {
      ready: insightReady,
      summary: insightSummary,
      evidenceMessageIds: userMessages
        .slice(-3)
        .map((message) => message.messageId)
        .filter((value): value is string => Boolean(value)),
      confidence: insightReady ? 0.82 : 0.26,
    },
    replyStrategy,
  };
}
