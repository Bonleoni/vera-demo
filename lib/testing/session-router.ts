import type { TestScenario, TestSession, SessionDecisionResult } from "@/lib/testing/test-types";

function makeTestSessionId(index: number): string {
  return `TEST-WM-${String(index + 1).padStart(6, "0")}`;
}

export function generateNextTestSessionId(knownSessions: TestSession[]): string {
  const nextIndex = knownSessions.reduce((maxIndex, session) => {
    const match = /^TEST-WM-(\d{6})$/.exec(session.id);
    if (!match) {
      return maxIndex;
    }

    const numericValue = Number(match[1]);
    return Math.max(maxIndex, numericValue);
  }, 0);

  return makeTestSessionId(nextIndex);
}

export function decideSessionAction(input: {
  simulatedUserId: string;
  activeSession: TestSession | null;
  knownSessions: TestSession[];
  currentTurn: number;
  scenario: TestScenario;
  latestForumReply?: string;
}): SessionDecisionResult {
  if (!input.activeSession) {
    return {
      action: "NEW_SESSION",
      sessionId: generateNextTestSessionId(input.knownSessions),
      reason: "No active session exists for this simulated user.",
    };
  }

  const sameUserSession = input.knownSessions.find(
    (session) =>
      session.userId === input.simulatedUserId &&
      session.scenarioId === input.scenario.id &&
      session.id !== input.activeSession?.id,
  );

  const sameUserActive = input.activeSession.userId === input.simulatedUserId;

  if (sameUserActive && input.currentTurn > 0) {
    return {
      action: "CONTINUE_SESSION",
      sessionId: input.activeSession.id,
      reason: "Same simulated user and same scenario context should continue the same session.",
    };
  }

  if (sameUserSession) {
    return {
      action: "SWITCH_SESSION",
      sessionId: sameUserSession.id,
      reason: "Existing session for this simulated user matches the scenario and is the best continuation target.",
    };
  }

  if (input.latestForumReply) {
    const lowered = input.latestForumReply.toLowerCase();
    if (/(question|clarify|ask|what|when|where|why|how)/i.test(lowered)) {
      return {
        action: "CONTINUE_SESSION",
        sessionId: input.activeSession.id,
        reason: "The system is still exploring the same pattern and should continue the current session.",
      };
    }
  }

  return {
    action: "NEW_SESSION",
    sessionId: generateNextTestSessionId(input.knownSessions),
    reason: "No established or relevant session match was found for this simulated user.",
  };
}
