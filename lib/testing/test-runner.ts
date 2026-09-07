import { evaluateConversationState } from "@/lib/conversation/insight-engine";import { MockAIProvider } from "@/lib/ai/mock-provider";
import { resolveAIProvider } from "@/lib/ai/provider-factory";import { evaluateStateTransition } from "@/lib/conversation/state-transition-engine";
import { processForumMessage } from "@/lib/pipeline/process-message";
import { generateSimulatedUserMessage } from "@/lib/testing/simulated-user";
import { decideSessionAction, generateNextTestSessionId } from "@/lib/testing/session-router";
import { evaluateAssertions } from "@/lib/testing/test-assertions";
import type { TestAssertion, TestRun, TestRunStatus, TestScenario, TestSession, TestTurn } from "@/lib/testing/test-types";
import type { ConversationHistoryEntry } from "@/lib/types/forum";

export interface TestRunOptions {
  scenario: TestScenario;
  mode: "MOCK" | "LIVE";
  userId?: string;
  maxMessages?: number;
  maxSessions?: number;
  maxTurnsWithoutProgress?: number;
}

export async function runTestScenario(options: TestRunOptions): Promise<TestRun> {
  const scenario = options.scenario;
  const userId = options.userId ?? `TEST-USER-${scenario.id}`;
  const maxMessages = options.maxMessages ?? scenario.maxMessages;
  const maxSessions = options.maxSessions ?? scenario.maxSessions;
  const maxTurnsWithoutProgress = options.maxTurnsWithoutProgress ?? 3;
  const testProvider = options.mode === "MOCK" ? new MockAIProvider() : resolveAIProvider();

  const sessions: TestSession[] = [];
  const turns: TestTurn[] = [];
  const stateTransitions: string[] = [];
  const insights: string[] = [];
  const errors: string[] = [];
  const assertions: TestAssertion[] = [];

  let runStatus: TestRunStatus = "RUNNING";
  let currentTurn = 0;
  let activeSession: TestSession | null = null;
  let turnsWithoutProgress = 0;

  while (currentTurn < maxMessages) {
    const plannedSession = decideSessionAction({
      simulatedUserId: userId,
      activeSession,
      knownSessions: sessions,
      currentTurn,
      scenario,
      latestForumReply: turns.at(-1)?.forumReply,
    });

    if (plannedSession.action === "NEW_SESSION") {
      const sessionId = plannedSession.sessionId || generateNextTestSessionId(sessions);
      const newSession: TestSession = {
        id: sessionId,
        userId,
        scenarioId: scenario.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 0,
        status: "ACTIVE",
      };
      sessions.push(newSession);
      activeSession = newSession;
    } else if (plannedSession.action === "SWITCH_SESSION") {
      const nextSession = sessions.find((session) => session.id === plannedSession.sessionId) ?? null;
      activeSession = nextSession;
    }

    if (!activeSession) {
      errors.push("No valid active session available.");
      runStatus = "FAILED";
      break;
    }

    const activeSessionId = activeSession.id;

    const history: ConversationHistoryEntry[] = turns
      .filter((turn) => turn.sessionId === activeSessionId)
      .flatMap((turn) => [
        {
          role: "user" as const,
          content: turn.userMessage,
          timestamp: turn.timestamp,
          messageId: `${turn.sessionId}-MSG-${turn.turnNumber}`,
        },
        {
          role: "assistant" as const,
          content: turn.forumReply,
          timestamp: turn.timestamp,
          replyId: `${turn.sessionId}-AIR-${turn.turnNumber}`,
        },
      ]);

    const simulated = generateSimulatedUserMessage({
      scenario,
      mode: options.mode,
      currentTurn,
      conversationHistory: history,
      latestForumReply: turns.at(-1)?.forumReply,
      sessionId: activeSessionId,
    });

    const previousCombinedHistory = statusHistoryForSession(activeSessionId, turns);

    const forumResult = await processForumMessage(simulated.message, "weight_management", {
      userId,
      sessionId: activeSessionId,
      conversationHistory: previousCombinedHistory,
    }, testProvider);

    const snapshot = evaluateConversationState(previousCombinedHistory, forumResult.knowledge.signals ?? []);
    const stateName = snapshot.state;
    const previousTurn = turns.filter((turn) => turn.sessionId === activeSessionId).at(-1);
    const stateTransition = evaluateStateTransition({
      previousState: previousTurn?.conversationState,
      currentState: stateName,
      conversationHistory: previousCombinedHistory,
      latestUserMessage: simulated.message,
      latestAssistantMessage: forumResult.reply.text,
      latestInsight: snapshot.insight.summary,
      confidence: snapshot.insight.confidence,
      replyStrategy: snapshot.replyStrategy,
    });
    const effectiveState = stateTransition.loopDetected ? stateTransition.to : stateName;

    const turnAssertionResults = evaluateAssertions(
      {
        turnNumber: currentTurn + 1,
        timestamp: new Date().toISOString(),
        userId,
        sessionId: activeSessionId,
        userMessage: simulated.message,
        forumReply: forumResult.reply.text,
        forumResult,
        conversationState: effectiveState,
        replyStrategy: snapshot.replyStrategy,
        confidence: snapshot.insight.confidence,
        insight: snapshot.insight.summary,
        sessionDecision: plannedSession.action,
        simulatedUser: {
          intent: simulated.intent,
          disclosure: simulated.disclosure,
          sessionSignal: simulated.sessionSignal,
          reasonSummary: simulated.reasonSummary,
        },
        assertions: [],
        errors: [],
        stateTransition: {
          fromState: stateTransition.from,
          toState: stateTransition.to,
          transition: stateTransition.transition,
          shouldAdvance: stateTransition.shouldAdvance,
          loopDetected: stateTransition.loopDetected,
          repeatedMessage: stateTransition.repeatedMessage,
          repeatedInsight: stateTransition.repeatedInsight,
          reason: stateTransition.reason,
        },
      },
      {
        id: `RUN-${Date.now()}`,
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        userId,
        status: "RUNNING",
        mode: options.mode,
        startedAt: new Date().toISOString(),
        maxMessages,
        maxSessions,
        sessions,
        turns,
        stateTransitions,
        insights,
        errors,
        finalAssessment: "REVIEW",
        assertions,
      },
    );

    const turn: TestTurn = {
      turnNumber: currentTurn + 1,
      timestamp: new Date().toISOString(),
      userId,
      sessionId: activeSessionId,
      userMessage: simulated.message,
      forumReply: forumResult.reply.text,
      forumResult,
      conversationState: effectiveState,
      replyStrategy: snapshot.replyStrategy,
      confidence: snapshot.insight.confidence,
      insight: snapshot.insight.summary,
      sessionDecision: plannedSession.action,
      simulatedUser: {
        intent: simulated.intent,
        disclosure: simulated.disclosure,
        sessionSignal: simulated.sessionSignal,
        reasonSummary: simulated.reasonSummary,
      },
      assertions: turnAssertionResults,
      errors: [],
      stateTransition: {
        fromState: stateTransition.from,
        toState: stateTransition.to,
        transition: stateTransition.transition,
        shouldAdvance: stateTransition.shouldAdvance,
        loopDetected: stateTransition.loopDetected,
        repeatedMessage: stateTransition.repeatedMessage,
        repeatedInsight: stateTransition.repeatedInsight,
        reason: stateTransition.reason,
      },
    };

    assertions.push(...turnAssertionResults);
    turns.push(turn);
    activeSession.messageCount += 1;
    activeSession.updatedAt = new Date().toISOString();
    stateTransitions.push(effectiveState);
    if (snapshot.insight.summary) {
      insights.push(snapshot.insight.summary);
    }

    const isDuplicateLoop = Boolean(
      previousTurn &&
      previousTurn.sessionId === activeSessionId &&
      previousTurn.userMessage === simulated.message &&
      previousTurn.insight === snapshot.insight.summary &&
      previousTurn.conversationState === effectiveState &&
      stateTransition.loopDetected,
    );

    if (isDuplicateLoop) {
      turnsWithoutProgress += 1;
    } else {
      turnsWithoutProgress = 0;
    }

    if (stateTransition.loopDetected && !stateTransition.shouldAdvance) {
      errors.push(`Loop guard triggered: ${stateTransition.reason}`);
      runStatus = "REVIEW";
      break;
    }

    if (turnsWithoutProgress >= maxTurnsWithoutProgress) {
      errors.push("Possible loop detected: repeated identical turn content without meaningful progression.");
      runStatus = "REVIEW";
      break;
    }

    currentTurn += 1;

    if (sessions.length > maxSessions) {
      break;
    }

    if (currentTurn >= maxMessages) {
      break;
    }
  }

  const run: TestRun = {
    id: `RUN-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    userId,
    status: runStatus === "RUNNING" ? "COMPLETED" : runStatus,
    mode: options.mode,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    maxMessages,
    maxSessions,
    sessions,
    turns,
    stateTransitions,
    insights,
    errors,
    finalAssessment: errors.length > 0 ? "REVIEW" : "PASS",
    assertions,
  };

  return run;
}

function statusHistoryForSession(sessionId: string, turns: TestTurn[]) {
  return turns
    .filter((turn) => turn.sessionId === sessionId)
    .flatMap((turn) => [
      { role: "user" as const, content: turn.userMessage, timestamp: turn.timestamp, messageId: `${turn.sessionId}-MSG-${turn.turnNumber}` },
      { role: "assistant" as const, content: turn.forumReply, timestamp: turn.timestamp, replyId: `${turn.sessionId}-AIR-${turn.turnNumber}` },
    ]);
}
