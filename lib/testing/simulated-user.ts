import type { TestScenario } from "@/lib/testing/test-types";
import type { ConversationHistoryEntry } from "@/lib/types/forum";

export interface SimulatedUserDecision {
  message: string;
  intent: string;
  disclosure: string;
  sessionSignal: string;
  reasonSummary: string;
}

export interface SimulatedUserContext {
  scenario: TestScenario;
  mode: "MOCK" | "LIVE";
  currentTurn: number;
  conversationHistory: ConversationHistoryEntry[];
  latestForumReply?: string;
  sessionId?: string;
}

const fallbackSignals = [
  "Evening timing is the most relevant trigger.",
  "The user is still revealing the pattern gradually.",
  "The current relationship seems behavioral rather than purely hunger-driven.",
];

function pickMockMessage(scenario: TestScenario, currentTurn: number): string {
  const index = Math.min(currentTurn, scenario.mockMessages.length - 1);
  return scenario.mockMessages[index] ?? scenario.mockMessages[scenario.mockMessages.length - 1] ?? "Bunu daha net açıklamak istiyorum.";
}

function heuristicLiveReply(scenario: TestScenario, latestForumReply?: string): string {
  const replyText = latestForumReply?.toLowerCase() ?? "";

  if (scenario.id === "EVENING_EATING") {
    if (/home|evening|kitchen|mutfak|eve|night/i.test(replyText)) {
      return "Evet, özellikle eve gelince mutfağa gidiyorum. Önce üstümü değiştiriyorum, ardından ara sıra atıştırıyorum.";
    }

    if (/stress|stres|tired|yorgun/i.test(replyText)) {
      return "İşten stresli gelince daha çok oluyor. Aç olmadan da mutfağa gidiyorum.";
    }

    return "Aslında bu daha çok rutin haline geldiği için oluyor. Eve gelmek bana bir tetikleyici.";
  }

  if (scenario.id === "BREAKFAST_SKIPPING") {
    if (/breakfast|kahvalt|morning|sabah/i.test(replyText)) {
      return "Evet, kahvaltıyı atladığım günler daha kötü oluyor. Öğlen de bazen sadece hızlı bir şey yiyorum.";
    }

    return "Sanırım kahvaltı atlamak akşam yemeğini etkiliyor. Gece daha çok acıkıyorum.";
  }

  if (/stress|stres|work|iş/i.test(replyText)) {
    return "Evet, stresli günlerde daha çok atıştırıyorum. Böyle günlerde yemek beni biraz sakinleştiriyor.";
  }

  return "Bunu fark ettim; stresli ve yoğun günlerde daha çok oluyor.";
}

export function generateSimulatedUserMessage(context: SimulatedUserContext): SimulatedUserDecision {
  const { scenario, mode, currentTurn, conversationHistory, latestForumReply } = context;

  if (mode === "MOCK") {
    const message = pickMockMessage(scenario, currentTurn);
    return {
      message,
      intent: "Reveal a small, realistic detail that advances the current behavioral pattern.",
      disclosure: `Mock scenario step ${currentTurn + 1} for ${scenario.name}.`,
      sessionSignal: `Scenario ${scenario.id}; turn ${currentTurn + 1}.`,
      reasonSummary: "The mock user is revealing the pattern progressively, as defined by the scenario list.",
    };
  }

  const message = heuristicLiveReply(scenario, latestForumReply);
  const userHistory = conversationHistory.filter((entry) => entry.role === "user").map((entry) => entry.content);
  const recentSignals = userHistory.slice(-2);

  return {
    message,
    intent: "Answer the latest system question with one new natural detail without revealing the whole pattern at once.",
    disclosure: recentSignals.length > 0 ? `The user adds a new detail while referencing prior context: ${recentSignals.join(" | ")}.` : "The user reveals a new detail without disclosing the full pattern prematurely.",
    sessionSignal: `Live simulation for ${scenario.id}; current turn ${currentTurn + 1}.`,
    reasonSummary: fallbackSignals[currentTurn % fallbackSignals.length] ?? "The user response is intentionally modest and aligned to the scenario objective.",
  };
}
