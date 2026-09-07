import type { TestRun } from "@/lib/testing/test-types";

export function exportTestRunJson(run: TestRun): string {
  return JSON.stringify(run, null, 2);
}

export function exportTestRunMarkdown(run: TestRun): string {
  const lines: string[] = [
    "# FORUM TEST RUN",
    "",
    "## RUN",
    `Run ID: ${run.id}`,
    `Scenario: ${run.scenarioName}`,
    `Status: ${run.status}`,
    `Mode: ${run.mode}`,
    `Started: ${run.startedAt}`,
    run.completedAt ? `Completed: ${run.completedAt}` : "Completed: n/a",
    "",
    "## USER",
    `User ID: ${run.userId}`,
    "",
  ];

  run.turns.forEach((turn, index) => {
    lines.push(`## TURN ${index + 1}`);
    lines.push("");
    lines.push("### SESSION");
    lines.push(`Session: ${turn.sessionId}`);
    lines.push("");
    lines.push("### USER MESSAGE");
    lines.push(turn.userMessage);
    lines.push("");
    lines.push("### FORUM RESPONSE");
    lines.push(turn.forumReply);
    lines.push("");
    lines.push("### FORUM JSON");
    lines.push(turn.forumResult ? JSON.stringify(turn.forumResult, null, 2) : "n/a");
    lines.push("");
    lines.push("### CONVERSATION STATE");
    lines.push(turn.conversationState);
    lines.push("");
    lines.push("### REPLY STRATEGY");
    lines.push(turn.replyStrategy);
    lines.push("");
    lines.push("### INSIGHT");
    lines.push(turn.insight ?? "n/a");
    lines.push("");
    lines.push("### SESSION DECISION");
    lines.push(turn.sessionDecision);
    lines.push("");
    lines.push("### ASSERTIONS");
    lines.push(...turn.assertions.map((assertion) => `- ${assertion.id}: ${assertion.status} - ${assertion.reason}`));
    lines.push("");
  });

  lines.push("## STATE PROGRESSION");
  lines.push(run.stateTransitions.join(" → ") || "n/a");
  lines.push("");
  lines.push("## SESSION HISTORY");
  lines.push(...run.sessions.map((session) => `- ${session.id}`));
  lines.push("");
  lines.push("## ASSERTIONS");
  lines.push(...run.assertions.map((assertion) => `- ${assertion.id}: ${assertion.status} - ${assertion.reason}`));
  lines.push("");
  lines.push("## FINAL RESULT");
  lines.push(run.finalAssessment);

  return lines.join("\n");
}
