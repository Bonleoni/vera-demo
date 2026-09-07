"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { CLAUDE_MASTER_PROMPT } from "@/lib/ai/claude-master-prompt";
import { OPENAI_SIMULATOR_PROMPT } from "@/lib/ai/openai-simulator-prompt";

const CHARACTER_CONTEXT = `Name: Ayşe
Age: 42
Nationality: Turkish
Occupation: Teacher
Personality: Skeptical and cautious
Communication Style: Short but polite
Knowledge Level: Basic
Motivation: Wants to lose weight
Goal: Understand whether the assistant can genuinely help her
Concerns:
- She has tried several diets before.
- She is worried about unrealistic promises.
Behavior Traits:
- Questions claims.
- Does not immediately trust recommendations.
- May ask for clarification.
Initial Situation:
She is contacting an AI assistant for the first time about weight control.`;

const INITIAL_USER_MESSAGE = `Merhaba. Kilo vermek istiyorum ama daha önce birkaç farklı diyet denedim ve hiçbirisi uzun süre işe yaramadı. Bana gerçekten nasıl yardımcı olabileceğinizi anlamak istiyorum.`;
const SECOND_USER_MESSAGE = "Anladım ama bana daha önce de benzer şeyler söylendi. Gerçekten işe yarayacağını nasıl anlayabilirim?";
const OPENAI_CHARACTER_SCENARIO = "A 42-year-old woman living in Istanbul wants to find a sustainable weight-control service. She has struggled with her weight for several years. She has tried several diets and programs before, lost weight temporarily, and regained it. She is skeptical of unrealistic weight-loss promises and does not want another short-term diet. She is price-sensitive and wants to understand whether the service can realistically help her maintain long-term results. She is not ready to purchase immediately and wants to ask questions before making a decision.";
const MANUAL_CHAT_STORAGE_KEY = "forum-manual-chat-history";
const DEFAULT_SIMULATOR_MODEL = "gpt-4o-mini";
const DEFAULT_RESPONDER_MODEL = "claude-sonnet-4-6";
const OPENAI_MODEL_OPTIONS = ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o4-mini"] as const;
const ANTHROPIC_MODEL_OPTIONS = ["claude-sonnet-4-5", "claude-opus-4-1", "claude-3-5-haiku-latest", "claude-haiku-4-5"] as const;
const SIDEBAR_COLLAPSED_STORAGE_KEY = "forum-sidebar-collapsed";
const DEFAULT_PROACTIVE_PROMPT = "Sen samimi bir koçluk asistanısın. Kullanıcının geçmiş konuşmasını özet olarak biliyorsun. Görevin: 1-2 cümlelik, sıcak, arkadaşça bir check-in mesajı yazmak. Asla satış yapma, asla uzun yazma. Kullanıcının kendi kelimelerine/saatlerine atıf yap. Türkçe yaz.";
const MANUAL_CHAT_PRESETS = [
  "akşamları çok sık yemek yiyorum.",
  "stresliyken çok fazla yiyorum.",
  "gece yemek yemeyi durduramıyorum.",
  "kilo veriyorum ama sonra hepsini geri alıyorum.",
  "iş dönüşü çok fazla yemek yiyorum.",
] as const;

type ManualChatMessage = {
  role: "customer" | "assistant";
  message: string;
};

type ModelSettings = {
  simulator: { provider: "openai"; model: string };
  responder: { provider: "anthropic"; model: string };
};

type PromptSettings = {
  simulatorPrompt: string;
  responderPrompt: string;
  proactivePrompt: string;
};

const dashboardPanelStyle = {
  border: "1px solid #e2e5ea",
  background: "#ffffff",
  padding: 18,
  borderRadius: 0,
} as const;

const dashboardMutedPanelStyle = {
  border: "1px solid #e2e5ea",
  background: "#f6f7f9",
  padding: 14,
  borderRadius: 0,
} as const;

const dashboardSectionLabelStyle = {
  fontSize: 12,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#405166",
  fontWeight: 700,
} as const;

const dashboardFieldLabelStyle = {
  fontWeight: 700,
  marginBottom: 8,
} as const;

const dashboardInputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: 10,
  border: "1px solid #d1d8e0",
  background: "#ffffff",
  borderRadius: 0,
} as const;

const dashboardTextareaStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  resize: "vertical" as const,
  padding: 10,
  border: "1px solid #d1d8e0",
  background: "#ffffff",
  borderRadius: 0,
} as const;

const dashboardPrimaryButtonStyle = {
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 700,
  borderRadius: 0,
} as const;

const dashboardSecondaryButtonStyle = {
  border: "1px solid #d1d8e0",
  background: "#ffffff",
  color: "#0f1c2e",
  cursor: "pointer",
  fontWeight: 700,
  borderRadius: 0,
} as const;

type LabTabId = "overview" | "conversation" | "manual-chat" | "api-models" | "prompt-studio" | "operations" | "proactive" | "customer-profile" | "ai-sales-coach" | "debug";

type OperationStatus = "active" | "idle" | "completed";

type OperationConversationSummary = {
  id: string;
  firstTs: string;
  lastTs: string;
  userMasked: string;
  msgCount: number;
  lastDirection: "in" | "out";
  lastText: string;
  avgLatencyMs: number | null;
  status: OperationStatus;
};

type OperationKpis = {
  todayMessages: number;
  activeConversations: number;
  avgResponseSec: number;
  totalConversations: number;
  activeUserRate: number;
  avgDepth: number;
};

type OperationDetail = {
  id: string;
  userMasked: string;
  events: Array<{
    convId: string;
    ts: string;
    direction: "in" | "out";
    text: string;
    latencyMs?: number;
    model?: string;
    meta?: {
      proactive?: boolean;
      trigger?: "daily_checkin" | "pattern" | "manual";
    };
  }>;
};

type ProactiveKpis = {
  todaySends: number;
  skippedWindowClosed: number;
  openWindows: number;
  pendingTriggers: number;
};

type ProactiveSettings = {
  dailyCheckinEnabled: boolean;
  dailyCheckinTime: string;
};

type ProactiveLogRow = {
  ts: string;
  dateKey: string;
  convId: string;
  trigger: "daily_checkin" | "pattern" | "manual" | "silence_nudge";
  status: "sent" | "skipped" | "failed";
  preview: string;
  reason?: string;
};

const toUserFriendlyError = (error: unknown): string => {
  if (error instanceof Error) {
    const message = error.message ?? "";

    if (error.name === "AbortError") {
      return "Test kullanıcı tarafından iptal edildi.";
    }

    if (/Failed to fetch|fetch failed|NetworkError|ERR_NETWORK|ERR_NAME_NOT_RESOLVED|timed out|timeout/i.test(message)) {
      return "Bağlantı hatası. Lütfen sunucunun çalıştığından emin olun.";
    }

    return message;
  }

  return "Bağlantı hatası. Lütfen sunucunun çalıştığından emin olun.";
};

const formatProfileValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join(", ");
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
};

const redactSensitiveClipboardText = (input: string): string => {
  return input
    .replace(/(Authorization\s*:\s*Bearer\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]")
    .replace(/(sk-[A-Za-z0-9]+)/gi, "[REDACTED]")
    .replace(/(api[_-]?key\s*[:=]\s*)([^\r\n]+)/gi, "$1[REDACTED]")
    .replace(/(x-api-key\s*[:=]\s*)([^\r\n]+)/gi, "$1[REDACTED]");
};

const copyTextToClipboard = async (text: string): Promise<void> => {
  const safeText = redactSensitiveClipboardText(text);

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(safeText);
      return;
    } catch {
      // Fall through to DOM fallback.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = safeText;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, safeText.length);

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Clipboard fallback failed");
  }
};

function renderSidebarIcon(tabId: LabTabId, color: string) {
  const iconStyle = { width: 20, height: 20, stroke: color, strokeWidth: 1.9, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  switch (tabId) {
    case "overview":
      return (
        <svg viewBox="0 0 24 24" style={iconStyle} aria-hidden="true">
          <path d="M4 14a8 8 0 1 1 16 0" />
          <path d="M12 14l4-4" />
          <circle cx="12" cy="14" r="1" />
        </svg>
      );
    case "conversation":
      return (
        <svg viewBox="0 0 24 24" style={iconStyle} aria-hidden="true">
          <path d="M4 6h16v10H8l-4 4V6z" />
        </svg>
      );
    case "manual-chat":
      return (
        <svg viewBox="0 0 24 24" style={iconStyle} aria-hidden="true">
          <path d="M4 6h16v9H9l-5 4V6z" />
          <path d="M13 8l3 3" />
          <path d="M12 12l-1 2 2-1 5-5-1-1-5 5z" />
        </svg>
      );
    case "customer-profile":
      return (
        <svg viewBox="0 0 24 24" style={iconStyle} aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M5 20c1.5-3 4-5 7-5s5.5 2 7 5" />
        </svg>
      );
    case "ai-sales-coach":
      return (
        <svg viewBox="0 0 24 24" style={iconStyle} aria-hidden="true">
          <path d="M9 18h6" />
          <path d="M10 21h4" />
          <path d="M8 14a6 6 0 1 1 8 0c-1 1-1.5 2-1.5 3h-5c0-1-.5-2-1.5-3z" />
        </svg>
      );
    case "api-models":
      return (
        <svg viewBox="0 0 24 24" style={iconStyle} aria-hidden="true">
          <rect x="7" y="7" width="10" height="10" rx="1.5" />
          <path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3" />
        </svg>
      );
    case "prompt-studio":
      return (
        <svg viewBox="0 0 24 24" style={iconStyle} aria-hidden="true">
          <path d="M6 4h9l3 3v13H6z" />
          <path d="M15 4v4h4" />
          <path d="M9 15l5-5 2 2-5 5-3 1 1-3z" />
        </svg>
      );
    case "operations":
      return (
        <svg viewBox="0 0 24 24" style={iconStyle} aria-hidden="true">
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M7 20h10" />
          <path d="M6 12h3l2-3 2 5 2-3h3" />
        </svg>
      );
    case "proactive":
      return (
        <svg viewBox="0 0 24 24" style={iconStyle} aria-hidden="true">
          <path d="M5 12h10" />
          <path d="M11 8l4 4-4 4" />
          <path d="M4 5h16v14H4z" />
        </svg>
      );
    case "debug":
      return (
        <svg viewBox="0 0 24 24" style={iconStyle} aria-hidden="true">
          <path d="M4 5h16v14H4z" />
          <path d="M8 10l-2 2 2 2" />
          <path d="M11 14h3" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" style={iconStyle} aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

function formatOperationStatus(status: OperationStatus): string {
  switch (status) {
    case "active":
      return "AKTİF";
    case "idle":
      return "BEKLEMEDE";
    case "completed":
      return "TAMAMLANDI";
  }
}

export function AiStressLab() {
  const [customScenario, setCustomScenario] = useState(OPENAI_CHARACTER_SCENARIO);
  const [firstMessage, setFirstMessage] = useState("");
  const [selectedTurnCount, setSelectedTurnCount] = useState<number>(2);
  const [uiError, setUiError] = useState<string | null>(null);
  const [customerProfile, setCustomerProfile] = useState<Record<string, unknown> | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<null | {
    status?: "ok" | "failed";
    score: number | null;
    reason: string;
  }>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [isEvaluatingCoach, setIsEvaluatingCoach] = useState(false);
  const [testMetrics, setTestMetrics] = useState<null | {
    sessionId: string;
    totalTurn: number;
    totalMessage: number;
    durationSeconds: string;
  }>(null);
  const [showDeveloperDebug, setShowDeveloperDebug] = useState(false);
  const [showFullScenario, setShowFullScenario] = useState(false);
  const [showRawCharacterJson, setShowRawCharacterJson] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [modelSettings, setModelSettings] = useState<ModelSettings>({
    simulator: { provider: "openai", model: DEFAULT_SIMULATOR_MODEL },
    responder: { provider: "anthropic", model: DEFAULT_RESPONDER_MODEL },
  });
  const [modelCustomSimulator, setModelCustomSimulator] = useState("");
  const [modelCustomResponder, setModelCustomResponder] = useState("");
  const [modelSaveStatus, setModelSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [promptSettings, setPromptSettings] = useState<PromptSettings>({
    simulatorPrompt: OPENAI_SIMULATOR_PROMPT,
    responderPrompt: CLAUDE_MASTER_PROMPT,
    proactivePrompt: DEFAULT_PROACTIVE_PROMPT,
  });
  const [promptDefaults, setPromptDefaults] = useState<PromptSettings>({
    simulatorPrompt: OPENAI_SIMULATOR_PROMPT,
    responderPrompt: CLAUDE_MASTER_PROMPT,
    proactivePrompt: DEFAULT_PROACTIVE_PROMPT,
  });
  const [promptSaveStatus, setPromptSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [operationsKpis, setOperationsKpis] = useState<OperationKpis>({
    todayMessages: 0,
    activeConversations: 0,
    avgResponseSec: 0,
    totalConversations: 0,
    activeUserRate: 0,
    avgDepth: 0,
  });
  const [operationsRows, setOperationsRows] = useState<OperationConversationSummary[]>([]);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [operationsError, setOperationsError] = useState<string | null>(null);
  const [operationsDateRange, setOperationsDateRange] = useState<"all" | "today" | "7d">("all");
  const [operationsStatus, setOperationsStatus] = useState<"all" | OperationStatus>("all");
  const [operationsSearch, setOperationsSearch] = useState("");
  const [operationsExpandedId, setOperationsExpandedId] = useState<string | null>(null);
  const [operationsDetail, setOperationsDetail] = useState<Record<string, OperationDetail>>({});
  const [operationsDetailLoading, setOperationsDetailLoading] = useState<string | null>(null);
  const [proactiveKpis, setProactiveKpis] = useState<ProactiveKpis>({
    todaySends: 0,
    skippedWindowClosed: 0,
    openWindows: 0,
    pendingTriggers: 0,
  });
  const [proactiveLogs, setProactiveLogs] = useState<ProactiveLogRow[]>([]);
  const [proactiveSettings, setProactiveSettings] = useState<ProactiveSettings>({
    dailyCheckinEnabled: true,
    dailyCheckinTime: "17:30",
  });
  const [proactiveLoading, setProactiveLoading] = useState(false);
  const [proactiveRunLoading, setProactiveRunLoading] = useState(false);
  const [proactiveSaveStatus, setProactiveSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [proactiveRunSummary, setProactiveRunSummary] = useState<string>("");
  const [activeTab, setActiveTab] = useState<LabTabId>("overview");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isTestingClaude, setIsTestingClaude] = useState(false);
  const [isTestingOpenAi, setIsTestingOpenAi] = useState(false);
  const [isTestingCharacter, setIsTestingCharacter] = useState(false);
  const [isTestingCharacterToClaude, setIsTestingCharacterToClaude] = useState(false);
  const [isTestingTwoTurnConversation, setIsTestingTwoTurnConversation] = useState(false);
  const [isManualChatLoading, setIsManualChatLoading] = useState(false);
  const [manualChatInput, setManualChatInput] = useState("");
  const [manualChatMessages, setManualChatMessages] = useState<ManualChatMessage[]>([]);
  const [manualChatPreset, setManualChatPreset] = useState<string>(MANUAL_CHAT_PRESETS[0]);
  const [claudeResult, setClaudeResult] = useState<null | {
    status?: string;
    model?: string;
    calls?: number;
    conversation?: Array<{ role: "user" | "assistant"; content: string }>;
    error?: string;
    failedCall?: number;
  }>(null);
  const [openAiResult, setOpenAiResult] = useState<null | {
    status?: string;
    model?: string;
    response?: string;
    error?: string;
  }>(null);
  const [characterResult, setCharacterResult] = useState<null | {
    status?: string;
    model?: string;
    scenario?: string;
    character?: Record<string, unknown>;
    error?: string;
    rawResponse?: string;
  }>(null);
  const [characterToClaudeResult, setCharacterToClaudeResult] = useState<null | {
    status?: string;
    scenario?: string;
    character?: Record<string, unknown>;
    openAiModel?: string;
    claudeModel?: string;
    initialMessage?: string;
    claudeResponse?: string;
    error?: string;
  }>(null);
  const [twoTurnConversationResult, setTwoTurnConversationResult] = useState<null | {
    status?: string;
    sessionId?: string;
    scenario?: string;
    character?: Record<string, unknown>;
    openAiModel?: string;
    claudeModel?: string;
    openAiCalls?: number;
    claudeCalls?: number;
    openAiCharacterMessage1?: string;
    claudeResponse1?: string;
    openAiCharacterMessage2?: string;
    claudeResponse2?: string;
    conversation?: Array<{ turn: number; role: string; provider: string; message: string }>;
    error?: string;
  }>(null);

  useEffect(() => {
    if (!isTestingTwoTurnConversation) {
      setElapsedSeconds(0);
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isTestingTwoTurnConversation]);

  useEffect(() => {
    try {
      const rawHistory = window.localStorage.getItem(MANUAL_CHAT_STORAGE_KEY);
      if (!rawHistory) {
        return;
      }

      const parsedHistory = JSON.parse(rawHistory) as unknown;
      if (!Array.isArray(parsedHistory)) {
        return;
      }

      const nextHistory = parsedHistory
        .filter((entry): entry is ManualChatMessage => (
          typeof entry === "object"
          && entry !== null
          && (entry as { role?: unknown }).role !== undefined
          && (entry as { message?: unknown }).message !== undefined
          && ((entry as { role?: unknown }).role === "customer" || (entry as { role?: unknown }).role === "assistant")
          && typeof (entry as { message?: unknown }).message === "string"
        ))
        .map((entry) => ({ role: entry.role, message: entry.message.trim() }))
        .filter((entry) => entry.message.length > 0);

      if (nextHistory.length > 0) {
        setManualChatMessages(nextHistory);
      }
    } catch {
      window.localStorage.removeItem(MANUAL_CHAT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (manualChatMessages.length === 0) {
      window.localStorage.removeItem(MANUAL_CHAT_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(MANUAL_CHAT_STORAGE_KEY, JSON.stringify(manualChatMessages));
  }, [manualChatMessages]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const modelsResponse = await fetch("/api/settings/models");
        if (modelsResponse.ok) {
          const modelsPayload = (await modelsResponse.json()) as ModelSettings;
          setModelSettings({
            simulator: { provider: "openai", model: modelsPayload.simulator?.model ?? DEFAULT_SIMULATOR_MODEL },
            responder: { provider: "anthropic", model: modelsPayload.responder?.model ?? DEFAULT_RESPONDER_MODEL },
          });
          setModelCustomSimulator(OPENAI_MODEL_OPTIONS.includes(modelsPayload.simulator?.model as any) ? "" : (modelsPayload.simulator?.model ?? ""));
          setModelCustomResponder(ANTHROPIC_MODEL_OPTIONS.includes(modelsPayload.responder?.model as any) ? "" : (modelsPayload.responder?.model ?? ""));
        }

        const promptsResponse = await fetch("/api/settings/prompts");
        if (promptsResponse.ok) {
          const promptsPayload = (await promptsResponse.json()) as { prompts?: PromptSettings; defaults?: PromptSettings };
          const loadedPrompts = promptsPayload.prompts ?? { simulatorPrompt: OPENAI_SIMULATOR_PROMPT, responderPrompt: CLAUDE_MASTER_PROMPT, proactivePrompt: DEFAULT_PROACTIVE_PROMPT };
          setPromptSettings({
            simulatorPrompt: loadedPrompts.simulatorPrompt,
            responderPrompt: loadedPrompts.responderPrompt,
            proactivePrompt: loadedPrompts.proactivePrompt ?? DEFAULT_PROACTIVE_PROMPT,
          });

          const loadedDefaults = promptsPayload.defaults ?? { simulatorPrompt: OPENAI_SIMULATOR_PROMPT, responderPrompt: CLAUDE_MASTER_PROMPT, proactivePrompt: DEFAULT_PROACTIVE_PROMPT };
          setPromptDefaults({
            simulatorPrompt: loadedDefaults.simulatorPrompt,
            responderPrompt: loadedDefaults.responderPrompt,
            proactivePrompt: loadedDefaults.proactivePrompt ?? DEFAULT_PROACTIVE_PROMPT,
          });
        }
      } catch {
        setModelSaveStatus("error");
        setPromptSaveStatus("error");
      }
    };

    void loadSettings();
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
      if (raw === "1") {
        setIsSidebarCollapsed(true);
      }
    } catch {
      // Ignore persistence read failures.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, isSidebarCollapsed ? "1" : "0");
    } catch {
      // Ignore persistence write failures.
    }
  }, [isSidebarCollapsed]);

  const loadOperations = async () => {
    setOperationsLoading(true);
    setOperationsError(null);

    try {
      const response = await fetch("/api/operations?view=list");
      if (!response.ok) {
        throw new Error("Operations verisi yuklenemedi.");
      }

      const payload = (await response.json()) as {
        kpis?: OperationKpis;
        conversations?: OperationConversationSummary[];
      };

      setOperationsKpis(payload.kpis ?? {
        todayMessages: 0,
        activeConversations: 0,
        avgResponseSec: 0,
        totalConversations: 0,
        activeUserRate: 0,
        avgDepth: 0,
      });
      setOperationsRows(Array.isArray(payload.conversations) ? payload.conversations : []);
    } catch (error) {
      setOperationsError(toUserFriendlyError(error));
    } finally {
      setOperationsLoading(false);
    }
  };

  const loadOperationDetail = async (id: string) => {
    setOperationsDetailLoading(id);
    try {
      const response = await fetch(`/api/operations?view=detail&id=${encodeURIComponent(id)}`);
      if (!response.ok) {
        throw new Error("Konusma detayi yuklenemedi.");
      }

      const payload = (await response.json()) as { detail?: OperationDetail };
      if (!payload.detail) {
        throw new Error("Konusma detayi bos dondu.");
      }

      setOperationsDetail((current) => ({ ...current, [id]: payload.detail! }));
    } catch (error) {
      setOperationsError(toUserFriendlyError(error));
    } finally {
      setOperationsDetailLoading(null);
    }
  };

  const loadProactive = async () => {
    setProactiveLoading(true);
    try {
      const response = await fetch("/api/proactive");
      if (!response.ok) {
        throw new Error("Proaktif verisi yuklenemedi.");
      }

      const payload = (await response.json()) as {
        kpis?: ProactiveKpis;
        settings?: ProactiveSettings;
        logs?: ProactiveLogRow[];
      };

      setProactiveKpis(payload.kpis ?? {
        todaySends: 0,
        skippedWindowClosed: 0,
        openWindows: 0,
        pendingTriggers: 0,
      });
      setProactiveSettings(payload.settings ?? {
        dailyCheckinEnabled: true,
        dailyCheckinTime: "17:30",
      });
      setProactiveLogs(Array.isArray(payload.logs) ? payload.logs : []);
    } catch (error) {
      setOperationsError(toUserFriendlyError(error));
    } finally {
      setProactiveLoading(false);
    }
  };

  const handleSaveProactiveSettings = async () => {
    setProactiveSaveStatus("idle");
    try {
      const response = await fetch("/api/proactive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proactiveSettings),
      });

      if (!response.ok) {
        throw new Error("Proaktif ayarlari kaydedilemedi.");
      }

      const payload = (await response.json()) as { settings?: ProactiveSettings };
      if (payload.settings) {
        setProactiveSettings(payload.settings);
      }

      setProactiveSaveStatus("saved");
      window.setTimeout(() => setProactiveSaveStatus("idle"), 2200);
    } catch {
      setProactiveSaveStatus("error");
      window.setTimeout(() => setProactiveSaveStatus("idle"), 2200);
    }
  };

  const handleRunProactiveRound = async () => {
    setProactiveRunLoading(true);
    setProactiveRunSummary("");
    try {
      const response = await fetch("/api/proactive/run", {
        method: "POST",
      });

      const payload = (await response.json()) as {
        sent?: number;
        skipped?: number;
        failed?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Proaktif tur basarisiz.");
      }

      setProactiveRunSummary(`Sent: ${payload.sent ?? 0} | Skipped: ${payload.skipped ?? 0} | Failed: ${payload.failed ?? 0}`);
      await loadProactive();
      await loadOperations();
    } catch (error) {
      setOperationsError(toUserFriendlyError(error));
    } finally {
      setProactiveRunLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "operations") {
      return;
    }

    void loadOperations();
    const interval = window.setInterval(() => {
      void loadOperations();
    }, 15000);

    return () => window.clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "proactive") {
      return;
    }

    void loadProactive();
    const interval = window.setInterval(() => {
      void loadProactive();
    }, 15000);

    return () => window.clearInterval(interval);
  }, [activeTab]);

  const statusLabel = uiError ? "ERROR" : isTestingTwoTurnConversation ? "RUNNING" : testMetrics ? "COMPLETED" : "READY";
  const durationDisplayText = testMetrics ? `${testMetrics.durationSeconds} sec` : `${elapsedSeconds}s`;
  const totalTurnsForProgress = Math.max(testMetrics?.totalTurn ?? selectedTurnCount, 1);
  const completedTurnsFromConversation = (() => {
    const conversationEntries = twoTurnConversationResult?.conversation ?? [];
    if (conversationEntries.length === 0) {
      return 0;
    }

    const assistantMessages = conversationEntries.filter((entry) => entry.role === "assistant").length;
    if (assistantMessages > 0) {
      return assistantMessages;
    }

    return Math.floor(conversationEntries.length / 2);
  })();
  const estimatedTurnsFromElapsed = isTestingTwoTurnConversation
    ? Math.min(Math.floor(elapsedSeconds / 3), Math.max(totalTurnsForProgress - 1, 0))
    : 0;
  const completedTurns = Math.min(Math.max(completedTurnsFromConversation, estimatedTurnsFromElapsed), totalTurnsForProgress);
  const isProgressCompleted = !isTestingTwoTurnConversation && Boolean(testMetrics);
  const progressPercent = isProgressCompleted ? 100 : Math.min((completedTurns / totalTurnsForProgress) * 100, 100);
  const progressLabelTurn = isProgressCompleted ? totalTurnsForProgress : completedTurns;
  const sidebarGroups = [
    {
      title: "LAB",
      items: [
        { id: "overview", label: "Genel Bakış" },
        { id: "conversation", label: "Sohbetler" },
        { id: "manual-chat", label: "Manuel Sohbet" },
        { id: "customer-profile", label: "Müşteri Profili" },
        { id: "ai-sales-coach", label: "AI Sales Coach" },
      ],
    },
    {
      title: "YÖNETİM",
      items: [
        { id: "api-models", label: "API Modelleri" },
        { id: "prompt-studio", label: "Prompt Stüdyosu" },
      ],
    },
    {
      title: "OPERASYON",
      items: [
        { id: "operations", label: "Operasyonlar" },
        { id: "proactive", label: "Proactive" },
      ],
    },
    {
      title: "GELİŞTİRİCİ",
      items: [
        { id: "debug", label: "Debug / Raw Data" },
      ],
    },
  ] as const;

  const customerSummary = customerProfile ? {
    name: formatProfileValue(customerProfile.name ?? ""),
    age: formatProfileValue(customerProfile.age ?? ""),
    occupation: formatProfileValue(customerProfile.occupation ?? ""),
    motivation: formatProfileValue(customerProfile.motivation ?? ""),
    goal: formatProfileValue(customerProfile.primary_goal ?? customerProfile.goal ?? ""),
  } : null;

  const formatDate = (iso: string): string => {
    const value = new Date(iso);
    if (!Number.isFinite(value.getTime())) {
      return "-";
    }
    return value.toLocaleDateString("tr-TR");
  };

  const formatTime = (iso: string): string => {
    const value = new Date(iso);
    if (!Number.isFinite(value.getTime())) {
      return "-";
    }
    return value.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  };

  const formatProactiveTrigger = (trigger: ProactiveLogRow["trigger"]): string => {
    switch (trigger) {
      case "daily_checkin":
        return "DAILY_CHECKIN";
      case "pattern":
        return "PATTERN_TRIGGER";
      case "manual":
        return "MANUAL";
      case "silence_nudge":
        return "SILENCE_NUDGE";
      default:
        return trigger;
    }
  };

  const filteredOperationsRows = operationsRows.filter((row) => {
    const ts = new Date(row.lastTs).getTime();
    const now = Date.now();

    if (operationsDateRange === "today") {
      const last = new Date(row.lastTs);
      const today = new Date();
      if (!(last.getFullYear() === today.getFullYear() && last.getMonth() === today.getMonth() && last.getDate() === today.getDate())) {
        return false;
      }
    }

    if (operationsDateRange === "7d") {
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (!Number.isFinite(ts) || now - ts > sevenDaysMs) {
        return false;
      }
    }

    if (operationsStatus !== "all" && row.status !== operationsStatus) {
      return false;
    }

    const search = operationsSearch.trim().toLowerCase();
    if (!search) {
      return true;
    }

    return row.id.toLowerCase().includes(search)
      || row.userMasked.toLowerCase().includes(search)
      || row.lastText.toLowerCase().includes(search);
  });

  const activeUserRateColor = operationsKpis.activeUserRate >= 50
    ? "#16a34a"
    : operationsKpis.activeUserRate >= 25
      ? "#ca8a04"
      : "#dc2626";

  const avgDepthColor = operationsKpis.avgDepth >= 5
    ? "#16a34a"
    : operationsKpis.avgDepth >= 3
      ? "#ca8a04"
      : "#dc2626";

  const clearManualChat = () => {
    setManualChatMessages([]);
    setManualChatInput("");
    setManualChatPreset(MANUAL_CHAT_PRESETS[0]);
    window.localStorage.removeItem(MANUAL_CHAT_STORAGE_KEY);
  };

  const handleSaveModelSettings = async () => {
    setModelSaveStatus("idle");
    try {
      const payload: ModelSettings = {
        simulator: {
          provider: "openai",
          model: modelCustomSimulator.trim() || modelSettings.simulator.model,
        },
        responder: {
          provider: "anthropic",
          model: modelCustomResponder.trim() || modelSettings.responder.model,
        },
      };

      const response = await fetch("/api/settings/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Model ayarları kaydedilemedi.");
      }

      const saved = (await response.json()) as ModelSettings;
      setModelSettings(saved);
      setModelSaveStatus("saved");
      window.setTimeout(() => setModelSaveStatus("idle"), 2000);
    } catch {
      setModelSaveStatus("error");
      window.setTimeout(() => setModelSaveStatus("idle"), 2000);
    }
  };

  const handleSavePromptSettings = async (nextPrompts: PromptSettings) => {
    setPromptSaveStatus("idle");
    try {
      const response = await fetch("/api/settings/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextPrompts),
      });

      if (!response.ok) {
        throw new Error("Prompt ayarları kaydedilemedi.");
      }

      const saved = (await response.json()) as PromptSettings;
      setPromptSettings(saved);
      setPromptSaveStatus("saved");
      window.setTimeout(() => setPromptSaveStatus("idle"), 2000);
    } catch {
      setPromptSaveStatus("error");
      window.setTimeout(() => setPromptSaveStatus("idle"), 2000);
    }
  };

  const handleResetPromptsToDefault = () => {
    const defaults = {
      simulatorPrompt: promptDefaults.simulatorPrompt,
      responderPrompt: promptDefaults.responderPrompt,
      proactivePrompt: promptDefaults.proactivePrompt,
    };
    setPromptSettings(defaults);
    void handleSavePromptSettings(defaults);
  };

  const handleManualChatSubmit = async (presetMessage?: string) => {
    const nextUserMessage = (presetMessage ?? manualChatInput).trim();
    if (!nextUserMessage || isManualChatLoading) {
      return;
    }

    const nextHistory: ManualChatMessage[] = [...manualChatMessages, { role: "customer", message: nextUserMessage }];
    setManualChatMessages(nextHistory);
    setManualChatInput("");
    setUiError(null);
    setIsManualChatLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: manualChatMessages,
          userMessage: nextUserMessage,
        }),
      });

      const payload = (await response.json()) as { reply?: string; error?: string };

      if (!response.ok || typeof payload.reply !== "string" || payload.reply.trim().length === 0) {
        const errorMessage = payload.error ?? "Manual chat yanıtı alınamadı.";
        throw new Error(errorMessage);
      }

      setManualChatMessages([...nextHistory, { role: "assistant", message: payload.reply.trim() }]);
    } catch (error) {
      const message = toUserFriendlyError(error);
      setUiError(message);
      setManualChatMessages(nextHistory);
    } finally {
      setIsManualChatLoading(false);
    }
  };

  const handleHomeReset = () => {
    abortControllerRef.current?.abort();
    setCustomScenario(OPENAI_CHARACTER_SCENARIO);
    setFirstMessage("");
    setSelectedTurnCount(2);
    setUiError(null);
    setCustomerProfile(null);
    setEvaluationResult(null);
    setCopyStatus("idle");
    setIsEvaluatingCoach(false);
    setTestMetrics(null);
    setShowDeveloperDebug(false);
    setShowFullScenario(false);
    setShowRawCharacterJson(false);
    setElapsedSeconds(0);
    setIsTestingClaude(false);
    setIsTestingOpenAi(false);
    setIsTestingCharacter(false);
    setIsTestingCharacterToClaude(false);
    setIsTestingTwoTurnConversation(false);
    setClaudeResult(null);
    setOpenAiResult(null);
    setCharacterResult(null);
    setCharacterToClaudeResult(null);
    setTwoTurnConversationResult(null);
    setActiveTab("overview");
    clearManualChat();
  };

  const handleClaudeSubmit = async () => {
    setIsTestingClaude(true);
    setUiError(null);
    setClaudeResult(null);

    try {
      const response = await fetch("/api/phase1-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claudeMasterPrompt: promptSettings.responderPrompt,
          characterContext: CHARACTER_CONTEXT,
          userMessage: INITIAL_USER_MESSAGE,
          secondUserMessage: SECOND_USER_MESSAGE,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        status?: string;
        model?: string;
        calls?: number;
        conversation?: Array<{ role: "user" | "assistant"; content: string }>;
        error?: string;
        failedCall?: number;
      };

      if (!response.ok) {
        const errorMessage = payload.error ?? "Sunucu hatası oluştu. Lütfen tekrar deneyin.";
        setUiError(errorMessage);
        throw new Error(errorMessage);
      }

      setUiError(null);
      setClaudeResult({
        status: payload.status ?? "SUCCESS",
        model: payload.model,
        calls: payload.calls ?? 2,
        conversation: payload.conversation ?? [],
      });
    } catch (error) {
      const message = toUserFriendlyError(error);
      setUiError(message);
      setClaudeResult({
        status: "FAILED",
        error: message,
        failedCall: 1,
      });
    } finally {
      setIsTestingClaude(false);
    }
  };

  const handleOpenAiSubmit = async () => {
    setIsTestingOpenAi(true);
    setUiError(null);
    setOpenAiResult(null);

    try {
      const response = await fetch("/api/phase1-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          message: "Reply with exactly: OPENAI_CONNECTION_OK",
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        status?: string;
        model?: string;
        response?: string;
        error?: string;
      };

      if (!response.ok) {
        const errorMessage = payload.error ?? "Sunucu hatası oluştu. Lütfen tekrar deneyin.";
        setUiError(errorMessage);
        throw new Error(errorMessage);
      }

      setUiError(null);
      setOpenAiResult({
        status: payload.status ?? "SUCCESS",
        model: payload.model,
        response: payload.response,
      });
    } catch (error) {
      const message = toUserFriendlyError(error);
      setUiError(message);
      setOpenAiResult({
        status: "FAILED",
        error: message,
      });
    } finally {
      setIsTestingOpenAi(false);
    }
  };

  const handleOpenAiCharacterSubmit = async () => {
    setIsTestingCharacter(true);
    setUiError(null);
    setCharacterResult(null);

    try {
      const response = await fetch("/api/phase1-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai-character",
          scenario: OPENAI_CHARACTER_SCENARIO,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        status?: string;
        model?: string;
        scenario?: string;
        character?: Record<string, unknown>;
        error?: string;
        rawResponse?: string;
      };

      if (!response.ok) {
        const errorMessage = payload.error ?? "Sunucu hatası oluştu. Lütfen tekrar deneyin.";
        setUiError(errorMessage);
        throw new Error(errorMessage);
      }

      setUiError(null);
      setCharacterResult({
        status: payload.status ?? "SUCCESS",
        model: payload.model,
        scenario: payload.scenario,
        character: payload.character,
        rawResponse: payload.rawResponse,
      });
    } catch (error) {
      const message = toUserFriendlyError(error);
      setUiError(message);
      setCharacterResult({
        status: "FAILED",
        error: message,
        scenario: OPENAI_CHARACTER_SCENARIO,
      });
    } finally {
      setIsTestingCharacter(false);
    }
  };

  const handleCharacterToClaudeSubmit = async () => {
    setIsTestingCharacterToClaude(true);
    setUiError(null);
    setCharacterToClaudeResult(null);

    try {
      const response = await fetch("/api/phase1-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai-claude-first-response",
          scenario: OPENAI_CHARACTER_SCENARIO,
          claudeMasterPrompt: promptSettings.responderPrompt,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        status?: string;
        scenario?: string;
        character?: Record<string, unknown>;
        openAiModel?: string;
        claudeModel?: string;
        initialMessage?: string;
        claudeResponse?: string;
        error?: string;
      };

      if (!response.ok) {
        const errorMessage = payload.error ?? "Sunucu hatası oluştu. Lütfen tekrar deneyin.";
        setUiError(errorMessage);
        throw new Error(errorMessage);
      }

      setUiError(null);
      setCharacterToClaudeResult({
        status: payload.status ?? "SUCCESS",
        scenario: payload.scenario,
        character: payload.character,
        openAiModel: payload.openAiModel,
        claudeModel: payload.claudeModel,
        initialMessage: payload.initialMessage,
        claudeResponse: payload.claudeResponse,
      });
    } catch (error) {
      const message = toUserFriendlyError(error);
      setUiError(message);
      setCharacterToClaudeResult({
        status: "FAILED",
        error: message,
        scenario: OPENAI_CHARACTER_SCENARIO,
      });
    } finally {
      setIsTestingCharacterToClaude(false);
    }
  };

  const handleCancelActiveTest = () => {
    abortControllerRef.current?.abort();
    setCustomerProfile(null);
    setEvaluationResult(null);
    setUiError("Test kullanıcı tarafından iptal edildi.");
  };

  const handleEvaluateConversation = async () => {
    if (!twoTurnConversationResult?.conversation || twoTurnConversationResult.conversation.length === 0) {
      return;
    }

    setIsEvaluatingCoach(true);
    setUiError(null);
    setEvaluationResult(null);

    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation: twoTurnConversationResult.conversation,
        }),
      });

      const payload = (await response.json()) as {
        status?: "ok" | "failed" | "evaluation_failed";
        score?: number | null;
        reason?: string;
        error?: string;
      };

      if (!response.ok || payload.status === "failed" || payload.status === "evaluation_failed" || payload.score === null || !Number.isFinite(payload.score)) {
        const errorMessage = payload.reason ?? payload.error ?? "Evaluation failed — retry";
        setUiError(errorMessage);
        setEvaluationResult({
          status: "failed",
          score: null,
          reason: errorMessage,
        });
        return;
      }

      setEvaluationResult({
        status: "ok",
        score: Number(payload.score),
        reason: typeof payload.reason === "string" && payload.reason.trim().length > 0 ? payload.reason.trim() : "Asistanın iletişimi ve müşteri yaklaşımı genel olarak olumlu yönde ilerledi.",
      });
    } catch (error) {
      const message = toUserFriendlyError(error);
      setUiError(message);
      setEvaluationResult(null);
    } finally {
      setIsEvaluatingCoach(false);
    }
  };

  const handleCopyResultsToClipboard = async () => {
    if (!testMetrics || !twoTurnConversationResult) {
      return;
    }

    try {
      const profileEntries = customerProfile ? Object.entries(customerProfile).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "") : [];
      const formattedLines: string[] = [
        "=== FORUM AI STRESS TEST RAPORU ===",
        `Session ID: ${testMetrics.sessionId}`,
        `Tarih: ${new Date().toISOString().slice(0, 10)}`,
        `Toplam Turn: ${testMetrics.totalTurn}`,
        `Toplam Mesaj: ${testMetrics.totalMessage}`,
        `Test Süresi: ${testMetrics.durationSeconds} saniye`,
        "",
        "--- MÜŞTERİ PROFİLİ ---",
      ];

      if (profileEntries.length === 0) {
        formattedLines.push("Müşteri profili mevcut değil.");
      } else {
        profileEntries.forEach(([key, value]) => {
          formattedLines.push(`${key}: ${formatProfileValue(value)}`);
        });
      }

      formattedLines.push("", "--- AI DEĞERLENDİRMESİ ---");
      if (evaluationResult) {
        formattedLines.push(`Puan: ${evaluationResult.score} / 10`);
        formattedLines.push(`Gerekçe: ${evaluationResult.reason}`);
      } else {
        formattedLines.push("Puan: -");
        formattedLines.push("Gerekçe: Değerlendirme yapılmadı.");
      }

      formattedLines.push("", "--- KONUŞMA DÖKÜMÜ ---");
      if (twoTurnConversationResult.conversation && twoTurnConversationResult.conversation.length > 0) {
        twoTurnConversationResult.conversation.forEach((entry) => {
          const speaker = entry.role === "customer" ? "Customer" : "Assistant";
          formattedLines.push(`[Turn ${entry.turn}] ${speaker}: ${entry.message}`);
        });
      } else {
        formattedLines.push("Konuşma verisi mevcut değil.");
      }

      const formattedText = formattedLines.join("\n");
      await copyTextToClipboard(formattedText);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("error");
      window.setTimeout(() => setCopyStatus("idle"), 2000);
      setUiError("Kopyalama başarısız. Tarayıcı izinleri engelledi.");
    }
  };

  const handleTwoTurnConversationSubmit = async () => {
    const turnsToRun = selectedTurnCount;
    const scenarioToSend = customScenario.trim().length > 0 ? customScenario.trim() : OPENAI_CHARACTER_SCENARIO;
    const controller = new AbortController();
    const startTime = Date.now();

    abortControllerRef.current = controller;
    setIsTestingTwoTurnConversation(true);
    setUiError(null);
    setCustomerProfile(null);
    setEvaluationResult(null);
    setTestMetrics(null);
    setTwoTurnConversationResult(null);

    try {
      const response = await fetch("/api/phase1-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          provider: "openai-claude-two-turn",
          scenario: scenarioToSend,
          claudeMasterPrompt: promptSettings.responderPrompt,
          turns: turnsToRun,
          firstMessage: firstMessage.trim(),
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        status?: string;
        sessionId?: string;
        scenario?: string;
        character?: Record<string, unknown>;
        openAiModel?: string;
        claudeModel?: string;
        openAiCalls?: number;
        claudeCalls?: number;
        openAiCharacterMessage1?: string;
        claudeResponse1?: string;
        openAiCharacterMessage2?: string;
        claudeResponse2?: string;
        conversation?: Array<{ turn: number; role: string; provider: string; message: string }>;
        error?: string;
        turns?: number;
      };

      if (!response.ok) {
        const errorMessage = payload.error ?? "Sunucu hatası oluştu. Lütfen tekrar deneyin.";
        setUiError(errorMessage);
        setTestMetrics(null);
        throw new Error(errorMessage);
      }

      const endTime = Date.now();
      const durationSeconds = ((endTime - startTime) / 1000).toFixed(1);
      const totalMessages = payload.conversation?.length ?? 0;
      const nextProfile = payload.character && typeof payload.character === "object" ? payload.character as Record<string, unknown> : null;

      setUiError(null);
      setCustomerProfile(nextProfile);
      setTestMetrics({
        sessionId: payload.sessionId ?? "FORUM-SESSION",
        totalTurn: payload.turns ?? turnsToRun,
        totalMessage: totalMessages,
        durationSeconds,
      });
      setTwoTurnConversationResult({
        status: payload.status ?? "SUCCESS",
        sessionId: payload.sessionId,
        scenario: payload.scenario,
        character: payload.character,
        openAiModel: payload.openAiModel,
        claudeModel: payload.claudeModel,
        openAiCalls: payload.openAiCalls,
        claudeCalls: payload.claudeCalls,
        openAiCharacterMessage1: payload.openAiCharacterMessage1,
        claudeResponse1: payload.claudeResponse1,
        openAiCharacterMessage2: payload.openAiCharacterMessage2,
        claudeResponse2: payload.claudeResponse2,
        conversation: payload.conversation,
      });
    } catch (error) {
      const message = toUserFriendlyError(error);
      setCustomerProfile(null);
      setEvaluationResult(null);
      setTestMetrics(null);
      setUiError(message);
      setTwoTurnConversationResult({
        status: "FAILED",
        error: message,
        scenario: scenarioToSend,
      });
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsTestingTwoTurnConversation(false);
    }
  };

  return (
    <div style={{ width: "100%", margin: 0, padding: 0 }}>
      <div style={{ border: "1px solid #d9dee6", background: "#ffffff", boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)" }}>
        <div style={{ background: "#ffffff", borderBottom: "1px solid #e2e5ea", padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              onClick={() => setActiveTab("operations")}
              style={{
                border: "1px solid #111827",
                background: "#111827",
                color: "#ffffff",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontSize: 11,
                padding: "6px 10px",
                cursor: "pointer",
                borderRadius: 0,
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
              }}
            >
              İŞLEMLER
            </button>
          </div>
        </div>

        {uiError && (
          <div style={{ margin: "18px 24px 0", background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b", padding: "12px 14px", fontWeight: 600 }} role="alert">
            {uiError}
          </div>
        )}

        {(isTestingTwoTurnConversation || testMetrics) && (
          <div style={{ margin: "14px 16px 0", border: "1px solid #d1d8e0", background: "#fff", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#405166", fontWeight: 700 }}>
                Turn progress
              </div>
              <div style={{ fontWeight: 800, color: "#0f172a" }}>
                Turn {progressLabelTurn} / {totalTurnsForProgress}
              </div>
            </div>
            <div style={{ width: "100%", height: 22, background: "#e2e8f0", borderRadius: 999, overflow: "hidden", boxShadow: "inset 0 1px 2px rgba(15, 23, 42, 0.08)", position: "relative" }}>
              <div
                aria-label="Turn progress bar"
                style={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: isProgressCompleted ? "#16a34a" : "linear-gradient(90deg, #22c55e 0%, #0ea5e9 100%)",
                  transition: "width 450ms ease-in-out, box-shadow 450ms ease-in-out",
                  boxShadow: isProgressCompleted ? "0 0 12px rgba(22, 163, 74, 0.25)" : "0 0 12px rgba(37, 99, 235, 0.2)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  color: progressPercent < 45 ? "#0f172a" : "#ffffff",
                  fontSize: 12,
                  letterSpacing: "0.04em",
                  textShadow: progressPercent < 45 ? "none" : "0 1px 1px rgba(15,23,42,0.35)",
                  pointerEvents: "none",
                }}
              >
                Turn {progressLabelTurn} / {totalTurnsForProgress}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: `${isSidebarCollapsed ? 64 : 230}px minmax(0, 1fr)`, minHeight: "calc(100vh - 120px)" }}>
          <aside style={{ background: "#0a101f", borderRight: "1px solid #18263c", padding: isSidebarCollapsed ? "10px 8px" : "0 0 14px", transition: "padding 160ms ease" }}>
            <div style={{ display: "grid", gap: isSidebarCollapsed ? 10 : 14 }}>
              {!isSidebarCollapsed ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px 4px", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setActiveTab("overview")}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#ffffff",
                      textAlign: "left",
                      fontSize: 42,
                      lineHeight: 0.95,
                      fontWeight: 800,
                      letterSpacing: "-0.06em",
                      padding: "0 4px",
                      cursor: "pointer",
                      borderRadius: 0,
                    }}
                  >
                    FORUM
                  </button>

                  <button
                    type="button"
                    title="Collapse sidebar"
                    onClick={() => setIsSidebarCollapsed((current) => !current)}
                    style={{
                      width: 32,
                      height: 32,
                      border: "1px solid #334155",
                      background: "linear-gradient(180deg, #1f334f 0%, #16263d 100%)",
                      color: "#f8fafc",
                      cursor: "pointer",
                      fontWeight: 700,
                      lineHeight: 1,
                      borderRadius: 999,
                      boxShadow: "0 6px 14px rgba(1, 7, 18, 0.35)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
                      flexShrink: 0,
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.transform = "translateY(-1px)";
                      event.currentTarget.style.borderColor = "#4f6788";
                      event.currentTarget.style.boxShadow = "0 10px 18px rgba(1, 7, 18, 0.45)";
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.transform = "translateY(0)";
                      event.currentTarget.style.borderColor = "#334155";
                      event.currentTarget.style.boxShadow = "0 6px 14px rgba(1, 7, 18, 0.35)";
                    }}
                  >
                    <span style={{ fontSize: 14, transform: "translateX(-1px)" }}>‹</span>
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "center", padding: "2px 0 4px" }}>
                  <button
                    type="button"
                    title="Expand sidebar"
                    onClick={() => setIsSidebarCollapsed((current) => !current)}
                    style={{
                      width: 32,
                      height: 32,
                      border: "1px solid #334155",
                      background: "linear-gradient(180deg, #1f334f 0%, #16263d 100%)",
                      color: "#f8fafc",
                      cursor: "pointer",
                      fontWeight: 700,
                      lineHeight: 1,
                      borderRadius: 999,
                      boxShadow: "0 6px 14px rgba(1, 7, 18, 0.35)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.transform = "translateY(-1px)";
                      event.currentTarget.style.borderColor = "#4f6788";
                      event.currentTarget.style.boxShadow = "0 10px 18px rgba(1, 7, 18, 0.45)";
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.transform = "translateY(0)";
                      event.currentTarget.style.borderColor = "#334155";
                      event.currentTarget.style.boxShadow = "0 6px 14px rgba(1, 7, 18, 0.35)";
                    }}
                  >
                    <span style={{ fontSize: 14, transform: "translateX(1px)" }}>›</span>
                  </button>
                </div>
              )}

              {sidebarGroups.map((group, groupIndex) => (
                <div key={group.title} style={{ display: "grid", gap: isSidebarCollapsed ? 6 : 8, paddingTop: groupIndex > 0 ? 8 : 0, paddingLeft: isSidebarCollapsed ? 0 : 12, paddingRight: isSidebarCollapsed ? 0 : 12, borderTop: groupIndex > 0 ? "1px solid #1e2f47" : "none" }}>
                  {!isSidebarCollapsed && (
                    <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8a94a6", fontWeight: 700, padding: "0 6px" }}>
                      {group.title}
                    </div>
                  )}
                  <div style={{ display: "grid", gap: 6 }}>
                    {group.items.map((item) => {
                      const isActive = activeTab === item.id;
                      const iconColor = isActive ? "#ffffff" : "#dbe3ee";

                      return (
                        <button
                          key={item.id}
                          type="button"
                          title={item.label}
                          onClick={() => setActiveTab(item.id)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: isSidebarCollapsed ? "center" : "flex-start",
                            gap: 10,
                            textAlign: "left",
                            padding: isSidebarCollapsed ? "9px 6px" : "10px 12px",
                            border: "1px solid transparent",
                            background: isActive ? "#2563eb" : "transparent",
                            color: "#ffffff",
                            fontWeight: 700,
                            cursor: "pointer",
                            borderRadius: 0,
                          }}
                          onMouseEnter={(event) => {
                            if (!isActive) {
                              event.currentTarget.style.background = "#16263d";
                            }
                          }}
                          onMouseLeave={(event) => {
                            if (!isActive) {
                              event.currentTarget.style.background = "transparent";
                            }
                          }}
                        >
                          {renderSidebarIcon(item.id, iconColor)}
                          {!isSidebarCollapsed && <span>{item.label}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <div style={{ padding: "14px 16px" }}>

          {activeTab === "overview" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)", gap: 20 }}>
                <section style={dashboardPanelStyle}>
                  <div style={{ ...dashboardSectionLabelStyle, marginBottom: 12 }}>
                    Test Configuration
                  </div>

                  <div style={{ display: "grid", gap: 12 }}>
                    <div>
                      <div style={dashboardFieldLabelStyle}>Scenario</div>
                      <textarea
                        value={customScenario}
                        onChange={(event) => setCustomScenario(event.target.value)}
                        rows={5}
                        placeholder="Describe the customer situation..."
                        style={dashboardTextareaStyle}
                      />
                    </div>

                    <div>
                      <label htmlFor="first-message-input" style={{ display: "block", ...dashboardFieldLabelStyle }}>
                        İLK MESAJ (OPSİYONEL)
                      </label>
                      <input
                        id="first-message-input"
                        type="text"
                        value={firstMessage}
                        onChange={(event) => setFirstMessage(event.target.value)}
                        placeholder="Boş bırakılırsa OpenAI üretir. Örn: Akşamları fazla yemek yiyorum"
                        style={dashboardInputStyle}
                      />
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                        <span>Turn count</span>
                        <select
                          value={selectedTurnCount}
                          onChange={(event) => setSelectedTurnCount(Number(event.target.value))}
                          disabled={isTestingTwoTurnConversation}
                          style={{ ...dashboardInputStyle, minWidth: 90, width: "auto" }}
                        >
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                          <option value={4}>4</option>
                          <option value={5}>5</option>
                          <option value={6}>6</option>
                          <option value={7}>7</option>
                          <option value={8}>8</option>
                          <option value={9}>9</option>
                          <option value={10}>10</option>
                        </select>
                      </label>

                      <button
                        type="button"
                        onClick={() => setShowFullScenario((current) => !current)}
                        style={{ ...dashboardSecondaryButtonStyle, padding: "8px 12px" }}
                      >
                        {showFullScenario ? "Hide full scenario" : "View full scenario"}
                      </button>
                    </div>

                    {showFullScenario && (
                      <div style={{ ...dashboardMutedPanelStyle, padding: 12 }}>
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Full scenario detail</div>
                        <div style={{ whiteSpace: "pre-wrap" }}>{customScenario || OPENAI_CHARACTER_SCENARIO}</div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleTwoTurnConversationSubmit}
                      disabled={isTestingClaude || isTestingOpenAi || isTestingCharacter || isTestingCharacterToClaude || isTestingTwoTurnConversation}
                      style={{
                        padding: "12px 16px",
                        ...dashboardPrimaryButtonStyle,
                        background: "#2563eb",
                        cursor: isTestingClaude || isTestingOpenAi || isTestingCharacter || isTestingCharacterToClaude || isTestingTwoTurnConversation ? "not-allowed" : "pointer",
                        fontWeight: 800,
                      }}
                    >
                      {isTestingTwoTurnConversation ? `Running ${selectedTurnCount}-turn test...` : `Run ${selectedTurnCount}-turn test`}
                    </button>

                    {isTestingTwoTurnConversation && (
                      <button
                        type="button"
                        onClick={handleCancelActiveTest}
                        style={{ padding: "10px 16px", border: "1px solid #dc2626", background: "#dc2626", color: "#fff", cursor: "pointer", fontWeight: 700, borderRadius: 0 }}
                      >
                        Stop test
                      </button>
                    )}
                  </div>
                </section>

                <section style={dashboardPanelStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
                    <div style={dashboardSectionLabelStyle}>
                      Session snapshot
                    </div>
                    {testMetrics?.sessionId ? (
                      <div style={{ fontSize: 12, color: "#475569" }}>Session ID: {testMetrics.sessionId}</div>
                    ) : null}
                  </div>

                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                      <div style={{ ...dashboardMutedPanelStyle, padding: 12 }}>
                        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>Status</div>
                        <div style={{ marginTop: 6, fontWeight: 800 }}>{statusLabel}</div>
                      </div>
                      <div style={{ ...dashboardMutedPanelStyle, padding: 12 }}>
                        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>Turns</div>
                        <div style={{ marginTop: 6, fontWeight: 800 }}>{testMetrics?.totalTurn ?? selectedTurnCount}</div>
                      </div>
                      <div style={{ ...dashboardMutedPanelStyle, padding: 12 }}>
                        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>Messages</div>
                        <div style={{ marginTop: 6, fontWeight: 800 }}>{testMetrics?.totalMessage ?? 0}</div>
                      </div>
                      <div style={{ ...dashboardMutedPanelStyle, padding: 12 }}>
                        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>Duration</div>
                        <div style={{ marginTop: 6, fontWeight: 800 }}>{durationDisplayText}</div>
                      </div>
                    </div>

                    <div style={dashboardMutedPanelStyle}>
                      <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b", marginBottom: 8 }}>Scenario summary</div>
                      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{(customScenario || OPENAI_CHARACTER_SCENARIO).slice(0, 260)}{(customScenario || OPENAI_CHARACTER_SCENARIO).length > 260 ? "…" : ""}</div>
                    </div>

                    {customerSummary && (
                      <div style={dashboardMutedPanelStyle}>
                        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b", marginBottom: 8 }}>Customer summary</div>
                        <div style={{ display: "grid", gap: 6 }}>
                          <div><strong>Name:</strong> {customerSummary.name || "—"}</div>
                          <div><strong>Age:</strong> {customerSummary.age || "—"}</div>
                          <div><strong>Occupation:</strong> {customerSummary.occupation || "—"}</div>
                          <div><strong>Goal:</strong> {customerSummary.goal || "—"}</div>
                        </div>
                      </div>
                    )}

                    {evaluationResult && (
                      <div style={{ border: "1px solid #c7d2fe", background: "#eff6ff", padding: 14, borderRadius: 0 }}>
                        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6d28d9", fontWeight: 700, marginBottom: 8 }}>AI Sales Coach result</div>
                        <div style={{ fontSize: 28, fontWeight: 800 }}>{evaluationResult.score ?? "—"} / 10</div>
                        <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{evaluationResult.reason}</div>
                      </div>
                    )}

                    <div style={{ marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={handleCopyResultsToClipboard}
                        disabled={!testMetrics || !twoTurnConversationResult}
                        style={{ padding: "10px 16px", border: "1px solid #2563eb", background: "#2563eb", color: "#fff", cursor: !testMetrics || !twoTurnConversationResult ? "not-allowed" : "pointer", fontWeight: 700, borderRadius: 0 }}
                      >
                        {copyStatus === "copied" ? "Copied ✓" : copyStatus === "error" ? "Copy failed" : "COPY FULL REPORT"}
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}

          {activeTab === "conversation" && (
            <section style={dashboardPanelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18 }}>
                <div style={dashboardSectionLabelStyle}>
                  Full conversation
                </div>
                {twoTurnConversationResult?.sessionId ? (
                  <div style={{ fontSize: 12, color: "#475569" }}>Session ID: {twoTurnConversationResult.sessionId}</div>
                ) : null}
              </div>

              {twoTurnConversationResult && !twoTurnConversationResult.error ? (
                <div style={{ display: "grid", gap: 14 }}>
                  {twoTurnConversationResult.conversation && twoTurnConversationResult.conversation.length > 0 ? (
                    twoTurnConversationResult.conversation.map((entry, index) => {
                      const isCustomer = entry.role === "customer";
                      const bubbleStyle = isCustomer
                        ? { background: "#f6f7f9", borderRadius: 0, border: "1px solid #e2e5ea" }
                        : { background: "#ffffff", borderRadius: 0, border: "1px solid #e2e5ea" };

                      return (
                        <div key={`${entry.turn}-${entry.role}-${index}`} style={{ display: "grid", gap: 8 }}>
                          <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>Turn {entry.turn}</div>
                          <div style={{ display: "flex", justifyContent: isCustomer ? "flex-start" : "flex-end" }}>
                            <div style={{ maxWidth: "82%", width: "100%" }}>
                              <div style={{ marginBottom: 6, fontWeight: 700, color: "#334155", textAlign: isCustomer ? "left" : "right" }}>
                                {isCustomer ? "Customer — OpenAI" : "Assistant — Claude"}
                              </div>
                              <div style={{ ...bubbleStyle, padding: "12px 14px", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                                {entry.message}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      <div style={{ ...dashboardMutedPanelStyle, padding: 12 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Turn 1</div>
                        <div style={{ marginBottom: 8 }}><strong>Customer:</strong> {twoTurnConversationResult.openAiCharacterMessage1}</div>
                        <div><strong>Assistant:</strong> {twoTurnConversationResult.claudeResponse1}</div>
                      </div>
                      <div style={{ ...dashboardMutedPanelStyle, padding: 12 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Turn 2</div>
                        <div style={{ marginBottom: 8 }}><strong>Customer:</strong> {twoTurnConversationResult.openAiCharacterMessage2}</div>
                        <div><strong>Assistant:</strong> {twoTurnConversationResult.claudeResponse2}</div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ border: "1px dashed #d1d8e0", background: "#f6f7f9", padding: 18, color: "#475569", borderRadius: 0 }}>
                  No live conversation has been generated yet.
                </div>
              )}
            </section>
          )}

          {activeTab === "manual-chat" && (
            <section style={dashboardPanelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                <div style={dashboardSectionLabelStyle}>
                  Manual Chat
                </div>
                <button
                  type="button"
                  onClick={clearManualChat}
                  style={{ ...dashboardSecondaryButtonStyle, padding: "8px 12px" }}
                >
                  Clear Chat
                </button>
              </div>

              {manualChatMessages.length === 0 && (
                <div style={{ ...dashboardMutedPanelStyle, padding: 12, marginBottom: 16, display: "grid", gap: 10 }}>
                  <div style={{ fontWeight: 700 }}>Başlangıç mesajı seç</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <select
                      value={manualChatPreset}
                      onChange={(event) => setManualChatPreset(event.target.value)}
                      style={{ ...dashboardInputStyle, minWidth: 320, maxWidth: "100%" }}
                    >
                      {MANUAL_CHAT_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>{preset}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleManualChatSubmit(manualChatPreset)}
                      disabled={isManualChatLoading}
                      style={{ ...dashboardPrimaryButtonStyle, padding: "8px 14px", cursor: isManualChatLoading ? "not-allowed" : "pointer" }}
                    >
                      {isManualChatLoading ? "..." : "Start with preset"}
                    </button>
                  </div>
                </div>
              )}

              <div style={{ border: "1px solid #e2e5ea", background: "#f6f7f9", minHeight: 220, maxHeight: 460, overflowY: "auto", padding: 12, display: "grid", gap: 12, borderRadius: 0 }}>
                {manualChatMessages.length === 0 ? (
                  <div style={{ color: "#64748b" }}>Henüz mesaj yok.</div>
                ) : (
                  manualChatMessages.map((entry, index) => {
                    const isCustomer = entry.role === "customer";
                    const bubbleStyle = isCustomer
                      ? { background: "#f6f7f9", borderRadius: 0, border: "1px solid #e2e5ea" }
                      : { background: "#ffffff", borderRadius: 0, border: "1px solid #e2e5ea" };

                    return (
                      <div key={`manual-${entry.role}-${index}`} style={{ display: "flex", justifyContent: isCustomer ? "flex-start" : "flex-end" }}>
                        <div style={{ maxWidth: "82%", width: "100%" }}>
                          <div style={{ marginBottom: 6, fontWeight: 700, color: "#334155", textAlign: isCustomer ? "left" : "right" }}>
                            {isCustomer ? "Customer" : "Assistant"}
                          </div>
                          <div style={{ ...bubbleStyle, padding: "12px 14px", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                            {entry.message}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {isManualChatLoading && (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ background: "#ffffff", border: "1px solid #e2e5ea", borderRadius: 0, padding: "10px 14px", fontWeight: 700 }}>
                      ...
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                <input
                  type="text"
                  value={manualChatInput}
                  onChange={(event) => setManualChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleManualChatSubmit();
                    }
                  }}
                  placeholder="Mesajını yaz..."
                  style={{ ...dashboardInputStyle, flex: 1 }}
                  disabled={isManualChatLoading}
                />
                <button
                  type="button"
                  onClick={() => void handleManualChatSubmit()}
                  disabled={isManualChatLoading || manualChatInput.trim().length === 0}
                  style={{ ...dashboardPrimaryButtonStyle, padding: "10px 16px", cursor: isManualChatLoading || manualChatInput.trim().length === 0 ? "not-allowed" : "pointer" }}
                >
                  Send
                </button>
              </div>
            </section>
          )}

          {activeTab === "api-models" && (
            <section style={dashboardPanelStyle}>
              <div style={{ ...dashboardSectionLabelStyle, marginBottom: 16 }}>
                API Models
              </div>
              <div style={{ display: "grid", gap: 14 }}>
                <div style={dashboardMutedPanelStyle}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>Soru Üretici (Müşteri Simülatörü)</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontWeight: 700 }}>Provider</span>
                      <select
                        value={modelSettings.simulator.provider}
                        onChange={() => setModelSettings((current) => ({ ...current, simulator: { ...current.simulator, provider: "openai" } }))}
                        style={dashboardInputStyle}
                      >
                        <option value="openai">openai</option>
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontWeight: 700 }}>Model</span>
                      <select
                        value={modelSettings.simulator.model}
                        onChange={(event) => setModelSettings((current) => ({ ...current, simulator: { ...current.simulator, model: event.target.value } }))}
                        style={dashboardInputStyle}
                      >
                        {OPENAI_MODEL_OPTIONS.map((modelId) => (
                          <option key={modelId} value={modelId}>{modelId}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontWeight: 700 }}>Özel model ID</span>
                      <input
                        type="text"
                        value={modelCustomSimulator}
                        onChange={(event) => setModelCustomSimulator(event.target.value)}
                        placeholder="Boş bırakılırsa dropdown kullanılır"
                        style={dashboardInputStyle}
                      />
                    </label>
                  </div>
                </div>

                <div style={dashboardMutedPanelStyle}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>Yanıtlayıcı (Satış Danışmanı)</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontWeight: 700 }}>Provider</span>
                      <select
                        value={modelSettings.responder.provider}
                        onChange={() => setModelSettings((current) => ({ ...current, responder: { ...current.responder, provider: "anthropic" } }))}
                        style={dashboardInputStyle}
                      >
                        <option value="anthropic">anthropic</option>
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontWeight: 700 }}>Model</span>
                      <select
                        value={modelSettings.responder.model}
                        onChange={(event) => setModelSettings((current) => ({ ...current, responder: { ...current.responder, model: event.target.value } }))}
                        style={dashboardInputStyle}
                      >
                        {ANTHROPIC_MODEL_OPTIONS.map((modelId) => (
                          <option key={modelId} value={modelId}>{modelId}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontWeight: 700 }}>Özel model ID</span>
                      <input
                        type="text"
                        value={modelCustomResponder}
                        onChange={(event) => setModelCustomResponder(event.target.value)}
                        placeholder="Boş bırakılırsa dropdown kullanılır"
                        style={dashboardInputStyle}
                      />
                    </label>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    type="button"
                    onClick={handleSaveModelSettings}
                    style={{ ...dashboardPrimaryButtonStyle, padding: "10px 16px" }}
                  >
                    Kaydet
                  </button>
                  <div style={{ fontWeight: 700, color: modelSaveStatus === "error" ? "#b42318" : "#166534" }}>
                    {modelSaveStatus === "saved" ? "Kaydedildi ✅" : modelSaveStatus === "error" ? "Kaydetme hatası" : ""}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "prompt-studio" && (
            <section style={dashboardPanelStyle}>
              <div style={{ ...dashboardSectionLabelStyle, marginBottom: 16 }}>
                Prompt Studio
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontWeight: 700 }}>Simülatör Prompt'u</span>
                  <textarea
                    rows={12}
                    value={promptSettings.simulatorPrompt}
                    onChange={(event) => setPromptSettings((current) => ({ ...current, simulatorPrompt: event.target.value }))}
                    style={dashboardTextareaStyle}
                  />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontWeight: 700 }}>Yanıtlayıcı Prompt'u</span>
                  <textarea
                    rows={16}
                    value={promptSettings.responderPrompt}
                    onChange={(event) => setPromptSettings((current) => ({ ...current, responderPrompt: event.target.value }))}
                    style={dashboardTextareaStyle}
                  />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontWeight: 700 }}>Proaktif Prompt</span>
                  <textarea
                    rows={8}
                    value={promptSettings.proactivePrompt}
                    onChange={(event) => setPromptSettings((current) => ({ ...current, proactivePrompt: event.target.value }))}
                    style={dashboardTextareaStyle}
                  />
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void handleSavePromptSettings(promptSettings)}
                    style={{ ...dashboardPrimaryButtonStyle, padding: "10px 16px" }}
                  >
                    Kaydet
                  </button>
                  <button
                    type="button"
                    onClick={handleResetPromptsToDefault}
                    style={{ ...dashboardSecondaryButtonStyle, padding: "10px 16px" }}
                  >
                    Varsayılana Dön
                  </button>
                  <div style={{ fontWeight: 700, color: promptSaveStatus === "error" ? "#b42318" : "#166534" }}>
                    {promptSaveStatus === "saved" ? "Kaydedildi ✅" : promptSaveStatus === "error" ? "Kaydetme hatası" : ""}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "operations" && (
            <section style={{ border: "1px solid #e2e5ea", background: "#ffffff", padding: 18, borderRadius: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b7280", fontWeight: 700 }}>
                  İŞLEMLER
                </div>
                <button
                  type="button"
                  onClick={() => void loadOperations()}
                  style={{ padding: "8px 12px", border: "1px solid #2563eb", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 700, borderRadius: 0 }}
                >
                  Yenile
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
                <div style={{ border: "1px solid #e2e5ea", background: "#ffffff", padding: 14, borderRadius: 0 }}>
                  <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>BUGÜNÜN MESAJLARI</div>
                  <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: "#0f1c2e" }}>{operationsKpis.todayMessages}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: "#16a34a", fontWeight: 700 }}>Canlı çalışma alanı hacmi</div>
                </div>
                <div style={{ border: "1px solid #e2e5ea", background: "#ffffff", padding: 14, borderRadius: 0 }}>
                  <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>AKTİF SOHBETLER</div>
                  <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: "#0f1c2e" }}>{operationsKpis.activeConversations}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: "#16a34a", fontWeight: 700 }}>Canlı</div>
                </div>
                <div style={{ border: "1px solid #e2e5ea", background: "#ffffff", padding: 14, borderRadius: 0 }}>
                  <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>ORT. YANIT SÜRESİ</div>
                  <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: "#0f1c2e" }}>{operationsKpis.avgResponseSec.toFixed(1)} sec</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: "#475569", fontWeight: 700 }}>Operasyonel gecikme</div>
                </div>
                <div style={{ border: "1px solid #e2e5ea", background: "#ffffff", padding: 14, borderRadius: 0 }}>
                  <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>TOPLAM SOHBET</div>
                  <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: "#0f1c2e" }}>{operationsKpis.totalConversations}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: "#475569", fontWeight: 700 }}>Çalışma alanı toplamı</div>
                </div>
                <div style={{ border: "1px solid #e2e5ea", background: "#ffffff", padding: 14, borderRadius: 0 }}>
                  <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>ACTIVE USERS</div>
                  <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: activeUserRateColor }}>{operationsKpis.activeUserRate.toFixed(1)}%</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: activeUserRateColor, fontWeight: 700 }}>3+ messages threshold</div>
                </div>
                <div style={{ border: "1px solid #e2e5ea", background: "#ffffff", padding: 14, borderRadius: 0 }}>
                  <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>AVG. CONVERSATION DEPTH</div>
                  <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: avgDepthColor }}>{operationsKpis.avgDepth.toFixed(1)}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: avgDepthColor, fontWeight: 700 }}>Messages per conversation</div>
                </div>
              </div>

              <div style={{ border: "1px solid #e2e5ea", background: "#ffffff", padding: 12, marginBottom: 14, borderRadius: 0 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", fontWeight: 700 }}>TARİH ARALIĞI</span>
                    <select value={operationsDateRange} onChange={(event) => setOperationsDateRange(event.target.value as "all" | "today" | "7d")} style={{ padding: "8px 10px", border: "1px solid #d1d8e0", background: "#ffffff", borderRadius: 0 }}>
                      <option value="all">Hepsi</option>
                      <option value="today">Bugün</option>
                      <option value="7d">Son 7 Gün</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", fontWeight: 700 }}>DURUM</span>
                    <select value={operationsStatus} onChange={(event) => setOperationsStatus(event.target.value as "all" | OperationStatus)} style={{ padding: "8px 10px", border: "1px solid #d1d8e0", background: "#ffffff", borderRadius: 0 }}>
                      <option value="all">Hepsi</option>
                      <option value="active">Aktif</option>
                      <option value="idle">Beklemede</option>
                      <option value="completed">Tamamlandı</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", fontWeight: 700 }}>ARA</span>
                    <input
                      type="text"
                      value={operationsSearch}
                      onChange={(event) => setOperationsSearch(event.target.value)}
                      placeholder="ID, mesaj icerigi veya kullanici ara"
                      style={{ padding: "8px 10px", border: "1px solid #d1d8e0", background: "#ffffff", borderRadius: 0 }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setOperationsDateRange("all");
                      setOperationsStatus("all");
                      setOperationsSearch("");
                    }}
                    style={{ justifySelf: "end", background: "transparent", border: "none", color: "#0f1c2e", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, cursor: "pointer", borderRadius: 0 }}
                  >
                    FİLTRELERİ TEMİZLE
                  </button>
                </div>
              </div>

              <div style={{ border: "1px solid #e2e5ea", background: "#ffffff", overflowX: "auto", borderRadius: 0 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                  <thead>
                    <tr style={{ background: "#0f1c2e", color: "#fff" }}>
                      {[
                        "SOHBET ID",
                        "TARİH",
                        "SAAT",
                        "KULLANICI",
                        "MESAJLAR",
                        "SON OLAY",
                        "ORT. YANIT",
                        "DURUM",
                        "",
                      ].map((title) => (
                        <th key={title} style={{ textAlign: "left", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 10px", whiteSpace: "nowrap" }}>{title}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {operationsLoading ? (
                      <tr>
                        <td colSpan={9} style={{ padding: 16, color: "#475569" }}>Yukleniyor...</td>
                      </tr>
                    ) : filteredOperationsRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding: 16, color: "#475569" }}>Kayit bulunamadi.</td>
                      </tr>
                    ) : (
                      filteredOperationsRows.map((row) => {
                        const isExpanded = operationsExpandedId === row.id;
                        const detail = operationsDetail[row.id];

                        const statusBg = row.status === "active" ? "#dcfce7" : row.status === "idle" ? "#fef9c3" : "#e5e7eb";
                        const statusColor = row.status === "active" ? "#166534" : row.status === "idle" ? "#854d0e" : "#374151";

                        return (
                          <Fragment key={row.id}>
                            <tr style={{ borderBottom: "1px solid #eef1f4" }}>
                              <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                                <button type="button" onClick={() => setOperationsExpandedId(isExpanded ? null : row.id)} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0, fontWeight: 700 }}>
                                  {row.id}
                                </button>
                              </td>
                              <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{formatDate(row.lastTs)}</td>
                              <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{formatTime(row.lastTs)}</td>
                              <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{row.userMasked}</td>
                              <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{row.msgCount}</td>
                              <td style={{ padding: "8px 10px", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.lastText}</td>
                              <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{row.avgLatencyMs !== null ? `${(row.avgLatencyMs / 1000).toFixed(1)}s` : "-"}</td>
                              <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                                <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 0, background: statusBg, color: statusColor, fontWeight: 700, fontSize: 12, border: "1px solid rgba(15,28,46,0.08)" }}>
                                  {formatOperationStatus(row.status)}
                                </span>
                              </td>
                              <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isExpanded) {
                                      setOperationsExpandedId(null);
                                      return;
                                    }
                                    setOperationsExpandedId(row.id);
                                    if (!operationsDetail[row.id]) {
                                      void loadOperationDetail(row.id);
                                    }
                                  }}
                                  style={{ border: "none", background: "transparent", color: "#2563eb", cursor: "pointer", fontWeight: 700, borderRadius: 0 }}
                                >
                                  Detayları Görüntüle
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={9} style={{ padding: "10px 12px", background: "#f8fafc", borderBottom: "1px solid #eef1f4" }}>
                                  {operationsDetailLoading === row.id && <div style={{ color: "#475569" }}>Detay yukleniyor...</div>}
                                  {!operationsDetailLoading && detail && (
                                    <div style={{ background: "#efeae2", border: "1px solid #e0dccf", padding: "0", borderRadius: 8, overflow: "hidden" }}>
                                      <div style={{ background: "#f0f2f5", borderBottom: "1px solid #d9dee6", padding: "10px 14px", display: "flex", alignItems: "baseline", gap: 8 }}>
                                        <span style={{ fontWeight: 700, color: "#1f2937" }}>{detail.userMasked}</span>
                                        <span style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.04em" }}>{row.id}</span>
                                      </div>
                                      <div style={{ maxHeight: 480, overflowY: "auto", padding: "18px 18px 20px", display: "grid", gap: 10 }}>
                                        {detail.events.map((event, index) => {
                                          const isIn = event.direction === "in";
                                          return (
                                            <div key={`${row.id}-${index}-${event.ts}`} style={{ display: "flex", justifyContent: isIn ? "flex-end" : "flex-start" }}>
                                              <div style={{ width: "fit-content", maxWidth: "70%", display: "grid", gap: 4 }}>
                                                <div
                                                  style={{
                                                    border: "1px solid rgba(15, 28, 46, 0.08)",
                                                    background: isIn ? "#d9fdd3" : "#ffffff",
                                                    padding: "8px 10px",
                                                    borderRadius: 8,
                                                    lineHeight: 1.55,
                                                    boxShadow: "0 1px 2px rgba(15, 28, 46, 0.12)",
                                                    whiteSpace: "pre-wrap",
                                                  }}
                                                >
                                                  <div>{event.text}</div>
                                                  {!isIn && event.meta?.proactive && (
                                                    <div style={{ marginTop: 6 }}>
                                                      <span style={{ display: "inline-block", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 800, color: "#9a3412", background: "#ffedd5", border: "1px solid #fdba74", padding: "2px 6px", borderRadius: 4 }}>
                                                        PROAKTIF
                                                      </span>
                                                    </div>
                                                  )}
                                                  <div style={{ marginTop: 4, fontSize: 11, color: "#667781", textAlign: "right" }}>{formatTime(event.ts)}</div>
                                                </div>
                                                {!isIn && (
                                                  <div style={{ fontSize: 11, color: "#667781", paddingLeft: 2 }}>
                                                    {event.model ? event.model : "-"}
                                                    {typeof event.latencyMs === "number" ? ` • ${(event.latencyMs / 1000).toFixed(1)}s` : ""}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {operationsError && (
                <div style={{ marginTop: 12, color: "#b42318", fontWeight: 700 }}>{operationsError}</div>
              )}
            </section>
          )}

          {activeTab === "proactive" && (
            <section style={{ border: "1px solid #e2e5ea", background: "#ffffff", padding: 18, borderRadius: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b7280", fontWeight: 700 }}>
                  PROACTIVE
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => void loadProactive()}
                    style={{ padding: "8px 12px", border: "1px solid #334155", background: "#334155", color: "#fff", cursor: "pointer", fontWeight: 700, borderRadius: 0 }}
                  >
                    Yenile
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRunProactiveRound()}
                    disabled={proactiveRunLoading}
                    style={{ padding: "8px 12px", border: "1px solid #ea580c", background: "#ea580c", color: "#fff", cursor: proactiveRunLoading ? "not-allowed" : "pointer", fontWeight: 800, borderRadius: 0 }}
                  >
                    {proactiveRunLoading ? "Calisiyor..." : "PROAKTIF TURU CALISTIR"}
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
                <div style={{ border: "1px solid #e2e5ea", background: "#ffffff", padding: 14, borderRadius: 0 }}>
                  <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>TODAY'S PROACTIVE SENDS</div>
                  <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: "#0f1c2e" }}>{proactiveKpis.todaySends}</div>
                </div>
                <div style={{ border: "1px solid #e2e5ea", background: "#ffffff", padding: 14, borderRadius: 0 }}>
                  <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>SKIPPED (WINDOW CLOSED)</div>
                  <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: "#0f1c2e" }}>{proactiveKpis.skippedWindowClosed}</div>
                </div>
                <div style={{ border: "1px solid #e2e5ea", background: "#ffffff", padding: 14, borderRadius: 0 }}>
                  <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>OPEN WINDOWS</div>
                  <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: "#0f1c2e" }}>{proactiveKpis.openWindows}</div>
                </div>
                <div style={{ border: "1px solid #e2e5ea", background: "#ffffff", padding: 14, borderRadius: 0 }}>
                  <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>PENDING TRIGGERS</div>
                  <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: "#0f1c2e" }}>{proactiveKpis.pendingTriggers}</div>
                </div>
              </div>

              <div style={{ border: "1px solid #e2e5ea", background: "#ffffff", padding: 12, marginBottom: 14, borderRadius: 0 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", fontWeight: 700, marginBottom: 10 }}>
                  Trigger Ayarlari
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, alignItems: "end" }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", fontWeight: 700 }}>Daily checkin saati</span>
                    <input
                      type="time"
                      value={proactiveSettings.dailyCheckinTime}
                      onChange={(event) => setProactiveSettings((current) => ({ ...current, dailyCheckinTime: event.target.value }))}
                      style={{ padding: "8px 10px", border: "1px solid #d1d8e0", background: "#ffffff", borderRadius: 0 }}
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "#0f1c2e" }}>
                    <input
                      type="checkbox"
                      checked={proactiveSettings.dailyCheckinEnabled}
                      onChange={(event) => setProactiveSettings((current) => ({ ...current, dailyCheckinEnabled: event.target.checked }))}
                    />
                    Daily checkin aktif
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => void handleSaveProactiveSettings()}
                      style={{ padding: "8px 12px", border: "1px solid #2563eb", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 700, borderRadius: 0 }}
                    >
                      Ayarlari Kaydet
                    </button>
                    <div style={{ fontWeight: 700, color: proactiveSaveStatus === "error" ? "#b42318" : "#166534" }}>
                      {proactiveSaveStatus === "saved" ? "Kaydedildi ✅" : proactiveSaveStatus === "error" ? "Kaydetme hatasi" : ""}
                    </div>
                  </div>
                </div>
                {proactiveRunSummary && (
                  <div style={{ marginTop: 10, color: "#0f172a", fontWeight: 700 }}>{proactiveRunSummary}</div>
                )}
              </div>

              <div style={{ border: "1px solid #e2e5ea", background: "#ffffff", overflowX: "auto", borderRadius: 0 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                  <thead>
                    <tr style={{ background: "#0f1c2e", color: "#fff" }}>
                      {["ZAMAN", "CONV ID", "TRIGGER", "DURUM", "MESAJ ONIZLEME", "NEDEN"].map((title) => (
                        <th key={title} style={{ textAlign: "left", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 10px", whiteSpace: "nowrap" }}>{title}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {proactiveLoading ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 16, color: "#475569" }}>Yukleniyor...</td>
                      </tr>
                    ) : proactiveLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 16, color: "#475569" }}>Log bulunamadi.</td>
                      </tr>
                    ) : (
                      proactiveLogs.map((row, index) => {
                        const badgeColor = row.status === "sent"
                          ? { bg: "#dcfce7", fg: "#166534" }
                          : row.status === "skipped"
                            ? { bg: "#fef3c7", fg: "#92400e" }
                            : { bg: "#fee2e2", fg: "#991b1b" };

                        return (
                          <tr key={`${row.convId}-${row.trigger}-${row.ts}-${index}`} style={{ borderBottom: "1px solid #eef1f4" }}>
                            <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{formatDate(row.ts)} {formatTime(row.ts)}</td>
                            <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{row.convId}</td>
                            <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{formatProactiveTrigger(row.trigger)}</td>
                            <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                              <span style={{ display: "inline-block", padding: "3px 8px", borderRadius: 0, background: badgeColor.bg, color: badgeColor.fg, fontWeight: 700, fontSize: 12 }}>
                                {row.status}
                              </span>
                            </td>
                            <td style={{ padding: "8px 10px", maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.preview || "-"}</td>
                            <td style={{ padding: "8px 10px", color: "#475569" }}>{row.reason ?? "-"}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "customer-profile" && (
            <section style={dashboardPanelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={dashboardSectionLabelStyle}>
                  Customer profile
                </div>
                <button
                  type="button"
                  onClick={() => setShowRawCharacterJson((current) => !current)}
                  style={{ ...dashboardSecondaryButtonStyle, padding: "8px 12px" }}
                >
                  {showRawCharacterJson ? "Hide raw JSON" : "View raw JSON"}
                </button>
              </div>

              {customerProfile ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                    {([
                      ["Name", customerProfile.name],
                      ["Age", customerProfile.age],
                      ["Gender", customerProfile.gender],
                      ["Occupation", customerProfile.occupation],
                      ["Motivation", customerProfile.motivation],
                      ["Primary goal", customerProfile.primary_goal],
                    ] as Array<[string, unknown]>).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "").map(([label, value]) => (
                      <div key={label} style={{ ...dashboardMutedPanelStyle, padding: 10 }}>
                        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>{label}</div>
                        <div style={{ fontWeight: 600, whiteSpace: "pre-wrap" }}>{formatProfileValue(value)}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    {([
                      ["Personality", customerProfile.personality],
                      ["Communication style", customerProfile.communication_style],
                      ["Concerns", customerProfile.concerns],
                      ["Objections", customerProfile.objections],
                    ] as Array<[string, unknown]>).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "").map(([label, value]) => (
                      <div key={label} style={{ ...dashboardMutedPanelStyle, padding: 10 }}>
                        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>{label}</div>
                        <div style={{ whiteSpace: "pre-wrap" }}>{formatProfileValue(value)}</div>
                      </div>
                    ))}
                  </div>

                  {showRawCharacterJson && (
                    <pre style={{ marginTop: 12, whiteSpace: "pre-wrap", background: "#0f1c2e", color: "#e2e8f0", padding: 12, overflowX: "auto", borderRadius: 0 }}>
                      {JSON.stringify(customerProfile, null, 2)}
                    </pre>
                  )}
                </>
              ) : (
                <div style={{ border: "1px dashed #d1d8e0", background: "#f6f7f9", padding: 18, color: "#475569", borderRadius: 0 }}>
                  No customer profile is available yet.
                </div>
              )}
            </section>
          )}

          {activeTab === "ai-sales-coach" && (
            <section style={dashboardPanelStyle}>
              <div style={{ ...dashboardSectionLabelStyle, marginBottom: 14 }}>
                AI Sales Coach
              </div>

              {twoTurnConversationResult && !twoTurnConversationResult.error ? (
                <>
                  <button
                    type="button"
                    onClick={handleEvaluateConversation}
                    disabled={isEvaluatingCoach || isTestingTwoTurnConversation}
                    style={{
                      padding: "10px 16px",
                      ...dashboardPrimaryButtonStyle,
                      cursor: isEvaluatingCoach || isTestingTwoTurnConversation ? "not-allowed" : "pointer",
                      fontWeight: 700,
                    }}
                  >
                    {isEvaluatingCoach ? "Running AI SALES COACH evaluation..." : "RUN AI SALES COACH EVALUATION"}
                  </button>

                  {isEvaluatingCoach && (
                    <div style={{ marginTop: 12, color: "#6d28d9", fontWeight: 700 }}>Evaluation is running...</div>
                  )}

                  {evaluationResult && (
                    evaluationResult.status === "failed" ? (
                      <div style={{ marginTop: 16, border: "1px solid #e2e5ea", background: "#f6f7f9", color: "#9a4d00", padding: 16, borderRadius: 0 }}>
                        <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>
                          Evaluation failed — Retry
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{evaluationResult.reason}</div>
                        <button
                          type="button"
                          onClick={handleEvaluateConversation}
                          disabled={isEvaluatingCoach || isTestingTwoTurnConversation}
                          style={{
                            padding: "10px 16px",
                            ...dashboardPrimaryButtonStyle,
                            cursor: isEvaluatingCoach || isTestingTwoTurnConversation ? "not-allowed" : "pointer",
                            fontWeight: 700,
                          }}
                        >
                          Retry evaluation
                        </button>
                      </div>
                    ) : (
                      <div style={{ marginTop: 16, border: "1px solid #e2e5ea", background: "#f6f7f9", padding: 16, borderRadius: 0 }}>
                        <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6d28d9", fontWeight: 700, marginBottom: 10 }}>
                          Score
                        </div>
                        <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.1, marginBottom: 12 }}>{evaluationResult.score} / 10</div>
                        <div style={{ fontSize: 16, fontWeight: 600, whiteSpace: "pre-wrap" }}>{evaluationResult.reason}</div>
                      </div>
                    )
                  )}
                </>
              ) : (
                <div style={{ border: "1px dashed #d1d8e0", background: "#f6f7f9", padding: 18, color: "#475569", borderRadius: 0 }}>
                  Run a conversation test first to enable AI evaluation.
                </div>
              )}
            </section>
          )}

          {activeTab === "debug" && (
            <div style={{ display: "grid", gap: 16 }}>
              <div style={dashboardPanelStyle}>
                <div style={{ ...dashboardSectionLabelStyle, marginBottom: 12 }}>
                  Technical logs
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <div><strong>OpenAI calls:</strong> {twoTurnConversationResult?.openAiCalls ?? 0}</div>
                  <div><strong>Claude calls:</strong> {twoTurnConversationResult?.claudeCalls ?? 0}</div>
                  <div><strong>Status:</strong> {twoTurnConversationResult?.status ?? "idle"}</div>
                  <div><strong>Session ID:</strong> {twoTurnConversationResult?.sessionId ?? testMetrics?.sessionId ?? "—"}</div>
                </div>
              </div>

              <div style={dashboardPanelStyle}>
                <div style={{ ...dashboardSectionLabelStyle, marginBottom: 12 }}>
                  Raw payloads
                </div>
                <div style={{ display: "grid", gap: 14 }}>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Conversation array</div>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", background: "#0f1c2e", color: "#e2e8f0", padding: 12, overflowX: "auto", borderRadius: 0 }}>
                      {JSON.stringify(twoTurnConversationResult?.conversation ?? [], null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Evaluation response</div>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", background: "#0f1c2e", color: "#e2e8f0", padding: 12, overflowX: "auto", borderRadius: 0 }}>
                      {JSON.stringify(evaluationResult ?? {}, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>

              <div style={dashboardPanelStyle}>
                <div style={{ ...dashboardSectionLabelStyle, marginBottom: 12 }}>
                  Phase checks
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  <button type="button" onClick={handleClaudeSubmit} disabled={isTestingClaude || isTestingOpenAi || isTestingCharacter} style={{ ...dashboardPrimaryButtonStyle, padding: "10px 16px", cursor: isTestingClaude || isTestingOpenAi || isTestingCharacter ? "not-allowed" : "pointer" }}>
                    {isTestingClaude ? "Running two Claude calls..." : "Test two-call conversation"}
                  </button>
                  <button type="button" onClick={handleOpenAiSubmit} disabled={isTestingClaude || isTestingOpenAi || isTestingCharacter} style={{ ...dashboardPrimaryButtonStyle, padding: "10px 16px", cursor: isTestingClaude || isTestingOpenAi || isTestingCharacter ? "not-allowed" : "pointer" }}>
                    {isTestingOpenAi ? "Testing OpenAI..." : "Test OpenAI connection"}
                  </button>
                  <button type="button" onClick={handleOpenAiCharacterSubmit} disabled={isTestingClaude || isTestingOpenAi || isTestingCharacter} style={{ ...dashboardPrimaryButtonStyle, padding: "10px 16px", cursor: isTestingClaude || isTestingOpenAi || isTestingCharacter ? "not-allowed" : "pointer" }}>
                    {isTestingCharacter ? "Generating character..." : "Test OpenAI character generation"}
                  </button>
                  <button type="button" onClick={handleCharacterToClaudeSubmit} disabled={isTestingClaude || isTestingOpenAi || isTestingCharacter || isTestingCharacterToClaude || isTestingTwoTurnConversation} style={{ ...dashboardPrimaryButtonStyle, padding: "10px 16px", cursor: isTestingClaude || isTestingOpenAi || isTestingCharacter || isTestingCharacterToClaude || isTestingTwoTurnConversation ? "not-allowed" : "pointer" }}>
                    {isTestingCharacterToClaude ? "Running OpenAI → Claude flow..." : "Test first response"}
                  </button>
                </div>

                {claudeResult && (
                  <div style={{ ...dashboardMutedPanelStyle, marginTop: 12, padding: 12 }}>
                    {claudeResult.error ? (
                      <div style={{ color: "#b42318" }}><strong>Error:</strong> {claudeResult.error}</div>
                    ) : (
                      <>
                        <div><strong>Status:</strong> {claudeResult.status ?? "SUCCESS"}</div>
                        {claudeResult.model ? <div><strong>Model:</strong> {claudeResult.model}</div> : null}
                        {claudeResult.calls ? <div><strong>Calls:</strong> {claudeResult.calls}</div> : null}
                      </>
                    )}
                  </div>
                )}

                {openAiResult && (
                  <div style={{ ...dashboardMutedPanelStyle, marginTop: 12, padding: 12 }}>
                    {openAiResult.error ? <div style={{ color: "#b42318" }}><strong>Error:</strong> {openAiResult.error}</div> : <><div><strong>Status:</strong> {openAiResult.status ?? "SUCCESS"}</div>{openAiResult.model ? <div><strong>Model:</strong> {openAiResult.model}</div> : null}{openAiResult.response ? <div style={{ marginTop: 8 }}><strong>Response:</strong> {openAiResult.response}</div> : null}</>}
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
