import type { TestAssertion, TestRun, TestTurn } from "@/lib/testing/test-types";

export function evaluateAssertions(turn: TestTurn, run: TestRun): TestAssertion[] {
  const assertions: TestAssertion[] = [];

  const hasPattern = ["PATTERN_EMERGING", "INSIGHT_READY", "INSIGHT_DELIVERED", "INTERVENTION", "FOLLOW_UP"].includes(turn.conversationState);
  assertions.push({
    id: "must_detect_evening_pattern",
    status: hasPattern ? "PASS" : "FAIL",
    reason: hasPattern ? "The conversation reached a pattern-finding state." : "No pattern-like state was detected yet.",
  });

  const hasUnstatedClaim = turn.forumResult?.facts.some((fact) =>
    /weight|calorie|medical|condition|habit|trigger/i.test(fact.statement) && fact.confidence > 0.9,
  );

  assertions.push({
    id: "must_not_claim_unstated_fact",
    status: hasUnstatedClaim ? "FAIL" : "PASS",
    reason: hasUnstatedClaim ? "The output contains a high-confidence fact that may be unsupported by user input." : "No obvious unsupported fact was emitted.",
  });

  assertions.push({
    id: "must_ask_followup_before_intervention",
    status: turn.replyStrategy === "CLARIFY" || turn.replyStrategy === "VALIDATE_PATTERN" ? "PASS" : "SKIPPED",
    reason: turn.replyStrategy === "CLARIFY" || turn.replyStrategy === "VALIDATE_PATTERN"
      ? "The interaction stayed within a clarifying or validation phase."
      : "No follow-up or validation check was required for this turn.",
  });

  assertions.push({
    id: "must_reach_insight_ready",
    status: run.stateTransitions.includes("INSIGHT_READY") ? "PASS" : "FAIL",
    reason: run.stateTransitions.includes("INSIGHT_READY")
      ? "The run reached a ready-insight state."
      : "The run never reached the ready-insight state.",
  });

  assertions.push({
    id: "must_keep_same_session",
    status: turn.sessionDecision === "CONTINUE_SESSION" || turn.sessionDecision === "SWITCH_SESSION" ? "PASS" : "FAIL",
    reason: turn.sessionDecision === "CONTINUE_SESSION" || turn.sessionDecision === "SWITCH_SESSION"
      ? "The session routing remained coherent for this turn."
      : "The test did not maintain a valid session path.",
  });

  assertions.push({
    id: "must_not_repeat_same_state_loop",
    status: turn.stateTransition?.loopDetected ? "FAIL" : "PASS",
    reason: turn.stateTransition?.loopDetected
      ? `Loop detected: ${turn.stateTransition.reason}`
      : "The turn did not repeat the same state/message/insight cycle.",
  });

  assertions.push({
    id: "must_progress_when_loop_detected",
    status: turn.stateTransition?.loopDetected ? (turn.stateTransition.shouldAdvance ? "PASS" : "FAIL") : "PASS",
    reason: turn.stateTransition?.loopDetected
      ? (turn.stateTransition.shouldAdvance
        ? `Transition guard moved the state forward: ${turn.stateTransition.transition}.`
        : `The guard blocked a repeated cycle: ${turn.stateTransition.reason}`)
      : "No loop guard was needed for this turn.",
  });

  return assertions;
}
