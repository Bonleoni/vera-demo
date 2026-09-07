"use client";

import { useEffect, useMemo, useState } from "react";

import { PipelineStatus, type PipelineStage } from "@/components/pipeline-status";
import { ResultTabs } from "@/components/result-tabs";
import { evaluateConversationState } from "@/lib/conversation/insight-engine";
import type {
  BusinessModel,
  ConversationHistoryEntry,
  ForumStructuredResult,
  ProcessErrorResult,
  ProcessingState,
} from "@/lib/types/forum";
import { validateForumResult } from "@/lib/validation/forum-result";

const EXAMPLE_MESSAGE =
  "Vestel invited us to a 5 million USD rooftop solar tender. We have a unique 6-month delivery advantage. Prepare the tender documents and remind me on October 15.";
const SESSION_STORAGE_KEY = "forum-weight-management-sessions-v1";
const ACTIVE_SESSION_STORAGE_KEY = "forum-weight-management-active-session-v1";

interface WeightManagementSessionMessage extends ConversationHistoryEntry {
  sessionId: string;
  businessModel: "weight_management";
  processingResult?: ForumStructuredResult;
}

interface WeightManagementSession {
  sessionId: string;
  businessModel: "weight_management";
  createdAt: string;
  updatedAt: string;
  messages: WeightManagementSessionMessage[];
}

function createInitialPipeline(): PipelineStage[] {
  return [
    { key: "INPUT", label: "INPUT", status: "waiting" },
    { key: "AI PROCESSING", label: "AI PROCESSING", status: "waiting" },
    { key: "JSON", label: "JSON", status: "waiting" },
    { key: "WORKSPACE", label: "WORKSPACE", status: "waiting" },
  ];
}

function updateStage(
  stages: PipelineStage[],
  key: PipelineStage["key"],
  status: ProcessingState,
): PipelineStage[] {
  return stages.map((stage) =>
    stage.key === key
      ? {
          ...stage,
          status,
        }
      : stage,
  );
}

function createCompletedPipeline(): PipelineStage[] {
  return createInitialPipeline().map((stage) => ({
    ...stage,
    status: "completed",
  }));
}

function generateNextSessionId(sessions: WeightManagementSession[]): string {
  const highestNumericId = sessions.reduce((maxId, session) => {
    const numericPart = Number(session.sessionId.replace("WM-", ""));
    return Number.isFinite(numericPart) ? Math.max(maxId, numericPart) : maxId;
  }, 0);

  return `WM-${String(highestNumericId + 1).padStart(6, "0")}`;
}

function isConversationHistoryEntry(value: unknown): value is ConversationHistoryEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string" &&
    typeof candidate.timestamp === "string"
  );
}

function parseStoredSessions(rawValue: string | null): WeightManagementSession[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((session): session is Record<string, unknown> => typeof session === "object" && session !== null)
      .map((session) => {
        const messages = Array.isArray(session.messages)
          ? session.messages
              .filter((message): message is Record<string, unknown> => typeof message === "object" && message !== null)
              .filter((message) => isConversationHistoryEntry(message))
              .map((message) => ({
                sessionId: typeof message.sessionId === "string" ? message.sessionId : String(session.sessionId ?? ""),
                businessModel: "weight_management" as const,
                role: message.role,
                content: message.content,
                timestamp: message.timestamp,
                messageId: typeof message.messageId === "string" ? message.messageId : undefined,
                replyId: typeof message.replyId === "string" ? message.replyId : undefined,
                processingResult: message.processingResult as ForumStructuredResult | undefined,
              }))
          : [];

        return {
          sessionId: typeof session.sessionId === "string" ? session.sessionId : "",
          businessModel: "weight_management" as const,
          createdAt: typeof session.createdAt === "string" ? session.createdAt : new Date().toISOString(),
          updatedAt: typeof session.updatedAt === "string" ? session.updatedAt : new Date().toISOString(),
          messages,
        };
      })
      .filter((session) => session.sessionId.length > 0);
  } catch {
    return [];
  }
}

function getLatestSessionResult(session: WeightManagementSession | null): ForumStructuredResult | null {
  if (!session) {
    return null;
  }

  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const candidate = session.messages[index]?.processingResult;
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function getSessionHistory(session: WeightManagementSession): ConversationHistoryEntry[] {
  return session.messages.map((message) => ({
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    messageId: message.messageId,
    replyId: message.replyId,
  }));
}

export function ForumPlayground() {
  const [message, setMessage] = useState("");
  const [businessModel, setBusinessModel] = useState<BusinessModel>("forum");
  const [forumResult, setForumResult] = useState<ForumStructuredResult | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStage[]>(createInitialPipeline());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessions, setSessions] = useState<WeightManagementSession[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    return parseStoredSessions(window.localStorage.getItem(SESSION_STORAGE_KEY));
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const storedSessions = parseStoredSessions(window.localStorage.getItem(SESSION_STORAGE_KEY));
    const storedActiveSessionId = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);

    return storedActiveSessionId && storedSessions.some((session) => session.sessionId === storedActiveSessionId)
      ? storedActiveSessionId
      : storedSessions[0]?.sessionId ?? null;
  });
  const [selectedAnalysisReplyId, setSelectedAnalysisReplyId] = useState<string | null>(null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.sessionId === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  const activeWeightManagementResult = useMemo(() => {
    if (!activeSession) {
      return null;
    }

    if (selectedAnalysisReplyId) {
      const matchingMessage = activeSession.messages.find(
        (sessionMessage) => sessionMessage.replyId === selectedAnalysisReplyId && sessionMessage.processingResult,
      );
      if (matchingMessage?.processingResult) {
        return matchingMessage.processingResult;
      }
    }

    return getLatestSessionResult(activeSession);
  }, [activeSession, selectedAnalysisReplyId]);

  const activeConversationState = useMemo(() => {
    if (!activeSession) {
      return {
        sessionId: "NONE",
        state: "DISCOVERY",
        replyStrategy: "CLARIFY",
        confidence: 0,
        messageCount: 0,
        insight: "No session selected yet.",
      };
    }

    const history = getSessionHistory(activeSession);
    const snapshot = evaluateConversationState(history, activeWeightManagementResult?.knowledge?.signals ?? []);

    return {
      sessionId: activeSession.sessionId,
      state: snapshot.state,
      replyStrategy: snapshot.replyStrategy,
      confidence: snapshot.insight.confidence,
      messageCount: history.length,
      insight: snapshot.insight.summary ?? "No clear pattern yet.",
    };
  }, [activeSession, activeWeightManagementResult]);

  const displayResult = businessModel === "forum" ? forumResult : activeWeightManagementResult;
  const displayPipeline = useMemo(() => {
    if (isProcessing || errorMessage) {
      return pipeline;
    }

    return displayResult ? createCompletedPipeline() : pipeline;
  }, [displayResult, errorMessage, isProcessing, pipeline]);

  const canSubmit = useMemo(() => {
    if (businessModel === "forum") {
      return !isProcessing;
    }

    return !isProcessing && Boolean(activeSessionId);
  }, [activeSessionId, businessModel, isProcessing]);

  useEffect(() => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));

    if (activeSessionId) {
      window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, activeSessionId);
      return;
    }

    window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  }, [activeSessionId, sessions]);

  const onLoadExample = () => {
    setMessage(EXAMPLE_MESSAGE);
  };

  const onCreateSession = () => {
    const timestamp = new Date().toISOString();
    const sessionId = generateNextSessionId(sessions);
    const nextSession: WeightManagementSession = {
      sessionId,
      businessModel: "weight_management",
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: [],
    };

    setSessions((currentSessions) => [nextSession, ...currentSessions]);
    setActiveSessionId(sessionId);
    setSelectedAnalysisReplyId(null);
    setErrorMessage(null);
    setPipeline(createInitialPipeline());
    setMessage("");
  };

  const onSelectBusinessModel = (nextModel: BusinessModel) => {
    setBusinessModel(nextModel);
    setErrorMessage(null);
    setPipeline(createInitialPipeline());

    if (nextModel === "forum") {
      setSelectedAnalysisReplyId(null);
      return;
    }

    setSelectedAnalysisReplyId(null);
  };

  const onSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setSelectedAnalysisReplyId(null);
    setErrorMessage(null);
    setPipeline(createInitialPipeline());
  };

  const processForum = async () => {
    setErrorMessage(null);
    setForumResult(null);
    setPipeline(createInitialPipeline());

    if (!message.trim()) {
      setPipeline((current) => updateStage(current, "INPUT", "error"));
      setErrorMessage("Please enter a business message before processing.");
      return;
    }

    setIsProcessing(true);
    setPipeline((current) => updateStage(current, "INPUT", "completed"));
    setPipeline((current) => updateStage(current, "AI PROCESSING", "processing"));

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: message.trim(), businessModel }),
      });

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        setPipeline((current) => updateStage(current, "AI PROCESSING", "error"));
        setErrorMessage("Malformed JSON response from API.");
        return;
      }

      if (!response.ok) {
        const errorPayload = payload as ProcessErrorResult;
        setPipeline((current) => updateStage(current, "AI PROCESSING", "error"));
        setErrorMessage(errorPayload?.error?.message ?? "API error during processing.");
        return;
      }

      setPipeline((current) => updateStage(current, "AI PROCESSING", "completed"));
      setPipeline((current) => updateStage(current, "JSON", "processing"));

      const validation = validateForumResult(payload);
      if (!validation.valid) {
        setPipeline((current) => updateStage(current, "JSON", "error"));
        setErrorMessage(`Invalid structured output: ${validation.errors.join("; ")}`);
        return;
      }

      const parsedResult = payload as ForumStructuredResult;
      setForumResult(parsedResult);
      setPipeline((current) => updateStage(current, "JSON", "completed"));
      setPipeline((current) => updateStage(current, "WORKSPACE", "completed"));
    } catch {
      setPipeline((current) => updateStage(current, "AI PROCESSING", "error"));
      setErrorMessage("Unexpected processing error.");
    } finally {
      setIsProcessing(false);
    }
  };

  const processWeightManagement = async () => {
    setErrorMessage(null);
    setPipeline(createInitialPipeline());

    if (!activeSession) {
      setPipeline((current) => updateStage(current, "INPUT", "error"));
      setErrorMessage("Create a Weight Management session before sending a message.");
      return;
    }

    if (!message.trim()) {
      setPipeline((current) => updateStage(current, "INPUT", "error"));
      setErrorMessage("Please enter a Weight Management message before processing.");
      return;
    }

    setIsProcessing(true);
    setPipeline((current) => updateStage(current, "INPUT", "completed"));
    setPipeline((current) => updateStage(current, "AI PROCESSING", "processing"));

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: message.trim(),
          businessModel: "weight_management",
          sessionId: activeSession.sessionId,
          conversationHistory: getSessionHistory(activeSession),
        }),
      });

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        setPipeline((current) => updateStage(current, "AI PROCESSING", "error"));
        setErrorMessage("Malformed JSON response from API.");
        return;
      }

      if (!response.ok) {
        const errorPayload = payload as ProcessErrorResult;
        setPipeline((current) => updateStage(current, "AI PROCESSING", "error"));
        setErrorMessage(errorPayload?.error?.message ?? "API error during processing.");
        return;
      }

      setPipeline((current) => updateStage(current, "AI PROCESSING", "completed"));
      setPipeline((current) => updateStage(current, "JSON", "processing"));

      const validation = validateForumResult(payload);
      if (!validation.valid) {
        setPipeline((current) => updateStage(current, "JSON", "error"));
        setErrorMessage(`Invalid structured output: ${validation.errors.join("; ")}`);
        return;
      }

      const parsedResult = payload as ForumStructuredResult;
      const userMessage: WeightManagementSessionMessage = {
        sessionId: activeSession.sessionId,
        businessModel: "weight_management",
        role: "user",
        content: parsedResult.input.message.content,
        timestamp: parsedResult.input.message.receivedAt,
        messageId: parsedResult.input.message.messageId,
      };
      const assistantMessage: WeightManagementSessionMessage = {
        sessionId: activeSession.sessionId,
        businessModel: "weight_management",
        role: "assistant",
        content: parsedResult.reply.text,
        timestamp: parsedResult.processing.completedAt,
        messageId: parsedResult.input.message.messageId,
        replyId: parsedResult.reply.replyId,
        processingResult: parsedResult,
      };

      setSessions((currentSessions) =>
        currentSessions.map((session) =>
          session.sessionId === activeSession.sessionId
            ? {
                ...session,
                updatedAt: parsedResult.processing.completedAt,
                messages: [...session.messages, userMessage, assistantMessage],
              }
            : session,
        ),
      );
      setSelectedAnalysisReplyId(parsedResult.reply.replyId);
      setMessage("");
      setPipeline((current) => updateStage(current, "JSON", "completed"));
      setPipeline((current) => updateStage(current, "WORKSPACE", "completed"));
    } catch {
      setPipeline((current) => updateStage(current, "AI PROCESSING", "error"));
      setErrorMessage("Unexpected processing error.");
    } finally {
      setIsProcessing(false);
    }
  };

  const onProcess = async () => {
    if (businessModel === "forum") {
      await processForum();
      return;
    }

    await processWeightManagement();
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="brand">FORUM</p>
          <h1>AI Operations</h1>
        </div>
      </header>

      <main className="app-main">
        {displayResult ? (
          <section className="panel">
            <div className="subtle-label">Business Model</div>
            <p>{businessModel === "forum" ? "FORUM" : "WEIGHT MANAGEMENT"}</p>
          </section>
        ) : null}

        <section className="panel">
          <h2>User Input</h2>
          <div className="subtle-label">Business Model</div>
          <div className="button-row" role="radiogroup" aria-label="Business Model">
            <label>
              <input
                type="radio"
                name="businessModel"
                value="forum"
                checked={businessModel === "forum"}
                onChange={() => onSelectBusinessModel("forum")}
                disabled={isProcessing}
              />{" "}
              FORUM
            </label>
            <label>
              <input
                type="radio"
                name="businessModel"
                value="weight_management"
                checked={businessModel === "weight_management"}
                onChange={() => onSelectBusinessModel("weight_management")}
                disabled={isProcessing}
              />{" "}
              Weight Management
            </label>
          </div>
        </section>

        {businessModel === "forum" ? (
          <>
            <section className="panel">
              <h2>User Input</h2>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Enter a business message for FORUM processing"
                rows={8}
              />
              <div className="button-row">
                <button type="button" className="secondary-button" onClick={onLoadExample} disabled={isProcessing}>
                  Load Example
                </button>
                <button type="button" className="primary-button" onClick={onProcess} disabled={!canSubmit}>
                  {isProcessing ? "Processing..." : "Process with AI"}
                </button>
              </div>
              {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
            </section>

            <PipelineStatus stages={displayPipeline} />

            {forumResult ? <ResultTabs result={forumResult} /> : null}
          </>
        ) : (
          <div className="wm-layout">
            <section className="panel">
              <div className="wm-toolbar">
                <div>
                  <div className="subtle-label">Session</div>
                  <p className="wm-session-title">{activeSessionId ? `SESSION: ${activeSessionId}` : "SESSION: NONE"}</p>
                </div>
                <button type="button" className="secondary-button" onClick={onCreateSession} disabled={isProcessing}>
                  + New Session
                </button>
              </div>

              <div className="wm-session-controls">
                <label className="wm-session-field">
                  <span className="subtle-label">Existing Sessions</span>
                  <select
                    value={activeSessionId ?? ""}
                    onChange={(event) => onSelectSession(event.target.value)}
                    disabled={isProcessing || sessions.length === 0}
                  >
                    <option value="" disabled>
                      {sessions.length === 0 ? "No sessions yet" : "Select a session"}
                    </option>
                    {sessions.map((session) => (
                      <option key={session.sessionId} value={session.sessionId}>
                        {session.sessionId}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="meta">
                  {activeSession ? `${activeSession.messages.length} messages in this session` : "Create a session to start the chat lab."}
                </p>
              </div>

              <section className="panel wm-debug-panel" aria-live="polite">
                <div className="subtle-label">DEBUG ONLY — NOT PART OF USER EXPERIENCE</div>
                <h2>Conversation State Debug</h2>
                <div className="wm-debug-grid">
                  <div className="wm-debug-row">
                    <span className="wm-debug-label">Session:</span>
                    <strong>{activeConversationState.sessionId}</strong>
                  </div>
                  <div className="wm-debug-row">
                    <span className="wm-debug-label">Current State:</span>
                    <strong>{activeConversationState.state}</strong>
                  </div>
                  <div className="wm-debug-row">
                    <span className="wm-debug-label">Reply Strategy:</span>
                    <strong>{activeConversationState.replyStrategy}</strong>
                  </div>
                  <div className="wm-debug-row">
                    <span className="wm-debug-label">Confidence:</span>
                    <strong>{activeConversationState.confidence.toFixed(2)}</strong>
                  </div>
                  <div className="wm-debug-row">
                    <span className="wm-debug-label">Message Count:</span>
                    <strong>{activeConversationState.messageCount}</strong>
                  </div>
                  <div className="wm-debug-row wm-debug-insight">
                    <span className="wm-debug-label">Insight:</span>
                    <strong>{activeConversationState.insight}</strong>
                  </div>
                </div>
              </section>

              <div className="wm-chat-thread" aria-live="polite">
                {activeSession && activeSession.messages.length > 0 ? (
                  activeSession.messages.map((sessionMessage, index) => {
                    const isAssistant = sessionMessage.role === "assistant";
                    const isSelected = isAssistant && sessionMessage.replyId === activeWeightManagementResult?.reply.replyId;

                    return (
                      <button
                        key={`${sessionMessage.role}-${sessionMessage.timestamp}-${index}`}
                        type="button"
                        className={isSelected ? "chat-message is-selected" : "chat-message"}
                        onClick={() => {
                          if (sessionMessage.replyId) {
                            setSelectedAnalysisReplyId(sessionMessage.replyId);
                          }
                        }}
                        disabled={!isAssistant}
                      >
                        <span className="chat-role">{isAssistant ? "AI" : "User"}</span>
                        <span className={isAssistant ? "chat-bubble assistant" : "chat-bubble user"}>{sessionMessage.content}</span>
                        <span className="chat-time">{new Date(sessionMessage.timestamp).toLocaleString()}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="chat-empty-state">
                    {"Create a session and send a message to start a persistent Weight Management conversation."}
                  </div>
                )}

                {isProcessing ? (
                  <div className="chat-message loading-message">
                    <span className="chat-role">AI</span>
                    <span className="chat-bubble assistant">Processing through the existing pipeline...</span>
                  </div>
                ) : null}
              </div>

              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Type a Weight Management message for the active session"
                rows={4}
                disabled={!activeSession || isProcessing}
              />
              <div className="button-row">
                <button type="button" className="primary-button" onClick={onProcess} disabled={!canSubmit}>
                  {isProcessing ? "Processing..." : "Send Message"}
                </button>
              </div>
              {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
            </section>

            <div className="wm-analysis-column">
              <PipelineStatus stages={displayPipeline} />
              {displayResult ? (
                <ResultTabs result={displayResult} />
              ) : (
                <section className="panel">
                  <h2>Result</h2>
                  <p className="meta">Workspace, JSON, and Logs will appear here for the selected session.</p>
                </section>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
