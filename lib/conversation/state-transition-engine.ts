export type ConversationTransitionSignal =
  | "CONTINUE_DISCOVERY"
  | "EXPLORE_PATTERN"
  | "DELIVER_INSIGHT"
  | "MOVE_TO_INTERVENTION"
  | "FOLLOW_UP"
  | "BREAK_LOOP";

export interface StateTransitionDecision {
  from: string;
  to: string;
  transition: ConversationTransitionSignal;
  shouldAdvance: boolean;
  loopDetected: boolean;
  repeatedMessage: boolean;
  repeatedInsight: boolean;
  reason: string;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function evaluateStateTransition(input: {
  previousState?: string;
  currentState: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  latestUserMessage?: string;
  latestAssistantMessage?: string;
  latestInsight?: string | null;
  confidence?: number;
  replyStrategy?: string;
}): StateTransitionDecision {
  const previousState = input.previousState ?? "DISCOVERY";
  const currentState = input.currentState;
  const normalizedPreviousMessage = normalizeText(
    input.conversationHistory.filter((entry) => entry.role === "user").at(-1)?.content ?? input.latestUserMessage ?? "",
  );
  const normalizedCurrentMessage = normalizeText(input.latestUserMessage ?? "");
  const normalizedPreviousInsight = normalizeText(
    input.conversationHistory.filter((entry) => entry.role === "assistant").at(-1)?.content ?? input.latestInsight ?? "",
  );
  const normalizedCurrentInsight = normalizeText(input.latestInsight ?? "");
  const repeatedMessage = Boolean(normalizedPreviousMessage && normalizedCurrentMessage && normalizedPreviousMessage === normalizedCurrentMessage);
  const repeatedInsight = Boolean(normalizedPreviousInsight && normalizedCurrentInsight && normalizedPreviousInsight === normalizedCurrentInsight);

  const sameStateLoop = currentState === previousState && previousState !== "DISCOVERY" && (repeatedMessage || repeatedInsight);
  const insightLoop = ["INSIGHT_READY", "INSIGHT_DELIVERED"].includes(previousState) && currentState === previousState && (repeatedMessage || repeatedInsight);
  const terminalLoop = ["INSIGHT_DELIVERED", "INTERVENTION", "FOLLOW_UP"].includes(previousState)
    && currentState === previousState
    && (repeatedMessage || repeatedInsight);

  const loopDetected = sameStateLoop || insightLoop || terminalLoop;

  let transition: ConversationTransitionSignal = "CONTINUE_DISCOVERY";
  let shouldAdvance = true;
  let reason = "State progression remains valid.";
  let acceptedState = currentState;

  if (loopDetected) {
    if (previousState === "INSIGHT_DELIVERED") {
      acceptedState = "INTERVENTION";
      transition = "MOVE_TO_INTERVENTION";
      shouldAdvance = true;
      reason = "Insight was already delivered; the conversation should move toward intervention rather than repeat the same insight.";
    } else if (previousState === "INSIGHT_READY") {
      acceptedState = "INSIGHT_DELIVERED";
      transition = "DELIVER_INSIGHT";
      shouldAdvance = true;
      reason = "Insight became stable; the system should mark delivery rather than re-assert readiness in a loop.";
    } else if (previousState === "PATTERN_EMERGING") {
      acceptedState = "INSIGHT_READY";
      transition = "DELIVER_INSIGHT";
      shouldAdvance = true;
      reason = "Pattern evidence is present; the system should progress toward insight readiness instead of repeating the same pattern signal.";
    } else {
      acceptedState = currentState === "DISCOVERY" ? "PATTERN_EMERGING" : currentState;
      transition = "BREAK_LOOP";
      shouldAdvance = false;
      reason = "Loop guard interrupted a repeated state/message/insight cycle and forced progress away from the repeated pattern.";
    }
  } else if (previousState === "DISCOVERY" && currentState === "PATTERN_EMERGING") {
    transition = "EXPLORE_PATTERN";
    shouldAdvance = true;
    reason = "Pattern exploration is valid and should continue.";
  } else if (previousState === "PATTERN_EMERGING" && currentState === "INSIGHT_READY") {
    transition = "DELIVER_INSIGHT";
    shouldAdvance = true;
    reason = "Pattern evidence is strong enough to move into insight readiness.";
  } else if (previousState === "INSIGHT_READY" && currentState === "INSIGHT_DELIVERED") {
    transition = "DELIVER_INSIGHT";
    shouldAdvance = true;
    reason = "Insight was delivered and should now be treated as an actionable acknowledgment point.";
  } else if (previousState === "INSIGHT_DELIVERED" && currentState === "INTERVENTION") {
    transition = "MOVE_TO_INTERVENTION";
    shouldAdvance = true;
    reason = "The user has reached an insight-delivery point and next step should be intervention or follow-up.";
  } else if (previousState === "INTERVENTION" && currentState === "FOLLOW_UP") {
    transition = "FOLLOW_UP";
    shouldAdvance = true;
    reason = "Intervention phase has been reached; follow-up should confirm a response and guard against repetition.";
  } else if (currentState === previousState && previousState !== "DISCOVERY") {
    shouldAdvance = false;
    reason = "Identical state repeated without new evidence; treat as a stalled transition.";
  }

  return {
    from: previousState,
    to: acceptedState,
    transition,
    shouldAdvance,
    loopDetected,
    repeatedMessage,
    repeatedInsight,
    reason,
  };
}
