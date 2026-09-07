import type { ConversationHistoryEntry } from "@/lib/types/forum";

import type { UserWeightMemory } from "./memory-types";

export function buildMemoryContext(
  memory: UserWeightMemory | null,
  currentMessage: string,
  currentSessionHistory: ConversationHistoryEntry[] = [],
): string | undefined {
  if (!memory) {
    return undefined;
  }

  const relevantFacts = memory.facts.slice(-3);
  const relevantGoals = memory.goals.slice(-2);
  const relevantPatterns = memory.patterns.slice(-3);
  const recentContext = memory.recentContext;

  const sections: string[] = [];

  if (relevantFacts.length > 0) {
    sections.push(
      "Previous user-stated facts:\n" + relevantFacts.map((fact) => `- ${fact.statement}`).join("\n"),
    );
  }

  if (relevantGoals.length > 0) {
    sections.push(
      "Previously stated goals:\n" + relevantGoals.map((goal) => `- ${goal.statement}`).join("\n"),
    );
  }

  if (relevantPatterns.length > 0) {
    sections.push(
      "Previous behavioral patterns to consider cautiously:\n" + relevantPatterns.map((pattern) => `- ${pattern.statement}`).join("\n"),
    );
  }

  if (recentContext.summary) {
    sections.push(`Recent context summary: ${recentContext.summary}`);
  }

  if (sections.length === 0) {
    return undefined;
  }

  const sessionContext = currentSessionHistory.length > 0 ? "Current session history is also available and should be prioritized for the current turn." : "No current session history beyond the latest message.";

  return [
    "Previous memory for this user (context only, not guaranteed truth):",
    ...sections,
    "",
    `Current user message: ${currentMessage}`,
    sessionContext,
    "",
    "Rules: use previous memory only when relevant; do not present inferred patterns as facts; trust the user's current statement when it conflicts with older memory; do not dump the memory list to the user.",
  ].join("\n");
}
