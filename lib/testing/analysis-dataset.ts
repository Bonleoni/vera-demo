import type { TestAssertion, TestAssessment, TestMode, TestRun, TestRunStatus, TestTurn } from "@/lib/testing/test-types";

export interface AnalysisDatasetTurn {
  runId: string;
  scenarioId: string;
  turnNumber: number;
  timestamp: string;
  sessionId: string;
  userId: string;
  userMessage: string;
  forumReply: string;
  conversationState: string;
  replyStrategy: string;
  confidence: number;
  insight: string | null;
  sessionAction: string;
  sessionReason: string;
  simulatedUserIntent: string | null;
  simulatedUserDisclosure: string | null;
  simulatedUserSessionSignal: string | null;
  simulatedUserReason: string | null;
  assertionSummary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  assertionResults: TestAssertion[];
}

export interface AnalysisDataset {
  datasetVersion: string;
  generatedAt: string;
  run: {
    runId: string;
    scenarioId: string;
    scenarioName: string;
    mode: TestMode;
    status: TestRunStatus;
    maxMessages: number;
    maxSessions: number;
    finalAssessment: TestAssessment;
  };
  summary: {
    turnCount: number;
    sessionCount: number;
    stateSequence: string[];
    insightCount: number;
    assertionCount: number;
    passedAssertions: number;
    failedAssertions: number;
    skippedAssertions: number;
    insightFirstAppearedTurn: number | null;
    insightReadyFirstTurn: number | null;
    finalState: string | null;
    sameSession: boolean;
    stateTransitionCount: number;
    averageConfidence: number | null;
  };
  turns: AnalysisDatasetTurn[];
}

function summarizeAssertions(assertions: TestAssertion[]) {
  return {
    total: assertions.length,
    passed: assertions.filter((assertion) => assertion.status === "PASS").length,
    failed: assertions.filter((assertion) => assertion.status === "FAIL").length,
    skipped: assertions.filter((assertion) => assertion.status === "SKIPPED").length,
  };
}

function getSessionReason(action: string): string {
  switch (action) {
    case "NEW_SESSION":
      return "No active session existed for the simulated user and a fresh session was created.";
    case "CONTINUE_SESSION":
      return "The simulated user remained in the same scenario context and should continue the current session.";
    case "SWITCH_SESSION":
      return "An existing session for the same scenario was determined to be the relevant continuation target.";
    default:
      return "Session routing was evaluated from the current test context.";
  }
}

function calculateStateTransitionCount(stateSequence: string[]): number {
  if (stateSequence.length < 2) {
    return 0;
  }

  return stateSequence.slice(1).reduce((count, state, index) => {
    const previousState = stateSequence[index];
    return count + (state !== previousState ? 1 : 0);
  }, 0);
}

export function buildAnalysisDataset(run: TestRun): AnalysisDataset {
  const stateSequence = run.turns.map((turn) => turn.conversationState);
  const sessionIds = [...new Set(run.turns.map((turn) => turn.sessionId))];
  const sameSession = run.turns.length > 0 && run.turns.every((turn) => turn.sessionId === run.turns[0].sessionId);
  const assertionSummary = summarizeAssertions(run.assertions);

  const insightFirstAppearedTurn = run.turns.findIndex((turn) => typeof turn.insight === "string" && turn.insight.trim().length > 0) + 1;
  const insightReadyFirstTurn = run.turns.findIndex((turn) => turn.conversationState === "INSIGHT_READY") + 1;
  const finalState = run.turns.at(-1)?.conversationState ?? null;
  const averageConfidence = run.turns.length > 0
    ? run.turns.reduce((sum, turn) => sum + turn.confidence, 0) / run.turns.length
    : null;

  const turns: AnalysisDatasetTurn[] = run.turns.map((turn: TestTurn) => ({
    runId: run.id,
    scenarioId: run.scenarioId,
    turnNumber: turn.turnNumber,
    timestamp: turn.timestamp,
    sessionId: turn.sessionId,
    userId: turn.userId,
    userMessage: turn.userMessage,
    forumReply: turn.forumReply,
    conversationState: turn.conversationState,
    replyStrategy: turn.replyStrategy,
    confidence: turn.confidence,
    insight: turn.insight,
    sessionAction: turn.sessionDecision,
    sessionReason: getSessionReason(turn.sessionDecision),
    simulatedUserIntent: turn.simulatedUser?.intent ?? null,
    simulatedUserDisclosure: turn.simulatedUser?.disclosure ?? null,
    simulatedUserSessionSignal: turn.simulatedUser?.sessionSignal ?? null,
    simulatedUserReason: turn.simulatedUser?.reasonSummary ?? null,
    assertionSummary: summarizeAssertions(turn.assertions),
    assertionResults: turn.assertions,
  }));

  return {
    datasetVersion: "analysis-dataset-v1",
    generatedAt: new Date().toISOString(),
    run: {
      runId: run.id,
      scenarioId: run.scenarioId,
      scenarioName: run.scenarioName,
      mode: run.mode,
      status: run.status,
      maxMessages: run.maxMessages,
      maxSessions: run.maxSessions,
      finalAssessment: run.finalAssessment,
    },
    summary: {
      turnCount: run.turns.length,
      sessionCount: sessionIds.length,
      stateSequence,
      insightCount: run.insights.length,
      assertionCount: assertionSummary.total,
      passedAssertions: assertionSummary.passed,
      failedAssertions: assertionSummary.failed,
      skippedAssertions: assertionSummary.skipped,
      insightFirstAppearedTurn: insightFirstAppearedTurn > 0 ? insightFirstAppearedTurn : null,
      insightReadyFirstTurn: insightReadyFirstTurn > 0 ? insightReadyFirstTurn : null,
      finalState,
      sameSession,
      stateTransitionCount: calculateStateTransitionCount(stateSequence),
      averageConfidence,
    },
    turns,
  };
}

export function exportAnalysisDatasetJson(dataset: AnalysisDataset): string {
  return JSON.stringify(dataset, null, 2);
}

export function exportAnalysisDatasetMarkdown(dataset: AnalysisDataset): string {
  const lines: string[] = [
    "# FORUM CONVERSATION ANALYSIS DATASET",
    "",
    "## DATASET",
    `Dataset Version: ${dataset.datasetVersion}`,
    `Generated At: ${dataset.generatedAt}`,
    "",
    "## RUN",
    `Run ID: ${dataset.run.runId}`,
    `Scenario: ${dataset.run.scenarioName}`,
    `Mode: ${dataset.run.mode}`,
    `Status: ${dataset.run.status}`,
    "",
    "## SUMMARY",
    `Turns: ${dataset.summary.turnCount}`,
    `Sessions: ${dataset.summary.sessionCount}`,
    `Same Session: ${dataset.summary.sameSession}`,
    `Final State: ${dataset.summary.finalState ?? "n/a"}`,
    `State Sequence: ${dataset.summary.stateSequence.join(" → ") || "n/a"}`,
    `Insight First Appeared: ${dataset.summary.insightFirstAppearedTurn ?? "n/a"}`,
    `Insight Ready First Turn: ${dataset.summary.insightReadyFirstTurn ?? "n/a"}`,
    `Average Confidence: ${dataset.summary.averageConfidence ?? "n/a"}`,
    "",
    "Assertions:",
    `- Passed: ${dataset.summary.passedAssertions}`,
    `- Failed: ${dataset.summary.failedAssertions}`,
    `- Skipped: ${dataset.summary.skippedAssertions}`,
    "",
  ];

  dataset.turns.forEach((turn, index) => {
    lines.push(`### TURN ${index + 1}`);
    lines.push("");
    lines.push(`Session: ${turn.sessionId}`);
    lines.push(`State: ${turn.conversationState}`);
    lines.push(`Strategy: ${turn.replyStrategy}`);
    lines.push(`Confidence: ${turn.confidence}`);
    lines.push("");
    lines.push("USER:");
    lines.push(turn.userMessage);
    lines.push("");
    lines.push("FORUM:");
    lines.push(turn.forumReply);
    lines.push("");
    lines.push("INSIGHT:");
    lines.push(turn.insight ?? "n/a");
    lines.push("");
    lines.push("SIMULATED USER:");
    lines.push(`Intent: ${turn.simulatedUserIntent ?? "n/a"}`);
    lines.push(`Disclosure: ${turn.simulatedUserDisclosure ?? "n/a"}`);
    lines.push(`Session Signal: ${turn.simulatedUserSessionSignal ?? "n/a"}`);
    lines.push(`Reason: ${turn.simulatedUserReason ?? "n/a"}`);
    lines.push("");
    lines.push("SESSION:");
    lines.push(`Action: ${turn.sessionAction}`);
    lines.push(`Reason: ${turn.sessionReason}`);
    lines.push("");
    lines.push("ASSERTIONS:");
    if (turn.assertionResults.length === 0) {
      lines.push("- n/a");
    } else {
      lines.push(...turn.assertionResults.map((assertion) => `- ${assertion.id}: ${assertion.status} - ${assertion.reason}`));
    }
    lines.push("");
  });

  return lines.join("\n");
}

export function exportAnalysisDatasetCompact(dataset: AnalysisDataset): string {
  const lines: string[] = [
    `RUN|${dataset.run.scenarioId}|${dataset.summary.turnCount} turns|${dataset.summary.sessionCount} session(s)`,
  ];

  dataset.turns.forEach((turn) => {
    const assertion = turn.assertionSummary;
    lines.push(
      `T${turn.turnNumber}|${turn.conversationState}|${turn.sessionAction}|conf=${turn.confidence}`,
    );
    lines.push(`U: ${turn.userMessage}`);
    lines.push(`F: ${turn.forumReply}`);
    lines.push(`I: ${turn.insight ?? "-"}`);
    lines.push(`A: ${assertion.passed}P/${assertion.failed}F/${assertion.skipped}S`);
  });

  lines.push(
    `FINAL|${dataset.summary.finalState ?? "n/a"}`,
  );
  lines.push(`INSIGHT_TURN|${dataset.summary.insightFirstAppearedTurn ?? "n/a"}`);
  lines.push(`SAME_SESSION|${dataset.summary.sameSession}`);

  return lines.join("\n");
}
