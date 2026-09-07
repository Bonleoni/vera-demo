import type { ForumStructuredResult } from "@/lib/types/forum";

export type SessionDecision = "NEW_SESSION" | "CONTINUE_SESSION" | "SWITCH_SESSION";
export type TestRunStatus = "IDLE" | "RUNNING" | "COMPLETED" | "FAILED" | "STOPPED" | "REVIEW";
export type TestMode = "MOCK" | "LIVE";
export type TestAssertionStatus = "PASS" | "FAIL" | "SKIPPED";
export type TestAssessment = "PASS" | "REVIEW" | "FAIL";

export interface TestScenario {
  id: string;
  name: string;
  businessModel: "weight_management";
  userProfile: string;
  objective: string;
  maxMessages: number;
  maxSessions: number;
  initialSessionMode: "NEW_SESSION" | "CONTINUE_SESSION";
  simulationInstructions: string[];
  mockMessages: string[];
  expectedStates?: string[];
  assertions: string[];
}

export interface TestSession {
  id: string;
  userId: string;
  scenarioId: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  status: "ACTIVE" | "COMPLETE" | "PAUSED";
}

export interface SessionDecisionResult {
  action: SessionDecision;
  sessionId: string;
  reason: string;
}

export interface SimulationResult {
  message: string;
  intent: string;
  disclosure: string;
  sessionSignal: string;
  reasonSummary: string;
}

export interface TestAssertion {
  id: string;
  status: TestAssertionStatus;
  reason: string;
}

export interface SimulatedUserTraceMetadata {
  intent: string;
  disclosure: string;
  sessionSignal: string;
  reasonSummary: string;
}

export interface StateTransitionMetadata {
  fromState: string;
  toState: string;
  transition: string;
  shouldAdvance: boolean;
  loopDetected: boolean;
  repeatedMessage: boolean;
  repeatedInsight: boolean;
  reason: string;
}

export interface TestTurn {
  turnNumber: number;
  timestamp: string;
  userId: string;
  sessionId: string;
  userMessage: string;
  forumReply: string;
  forumResult: ForumStructuredResult | null;
  conversationState: string;
  replyStrategy: string;
  confidence: number;
  insight: string | null;
  sessionDecision: SessionDecision;
  simulatedUser: SimulatedUserTraceMetadata | null;
  assertions: TestAssertion[];
  errors: string[];
  stateTransition?: StateTransitionMetadata;
}

export interface TestRun {
  id: string;
  scenarioId: string;
  scenarioName: string;
  userId: string;
  status: TestRunStatus;
  mode: TestMode;
  startedAt: string;
  completedAt?: string;
  maxMessages: number;
  maxSessions: number;
  sessions: TestSession[];
  turns: TestTurn[];
  stateTransitions: string[];
  insights: string[];
  errors: string[];
  finalAssessment: TestAssessment;
  assertions: TestAssertion[];
}
