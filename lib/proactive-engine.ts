import { promises as fs } from "node:fs";
import path from "node:path";
import { getConfig, getPrompts } from "@/lib/config-store";
import { callLLM } from "@/lib/llm";
import {
  appendEvent,
  getConversation,
  getConversationTarget,
  getConversations,
  getWindowStatus,
  type ProactiveTrigger,
} from "@/lib/conversation-store";
import { sendWhatsApp } from "@/lib/twilio-send";

type ProactiveLogTrigger = ProactiveTrigger | "silence_nudge";

type ProactiveLogStatus = "sent" | "skipped" | "failed";

export type ProactiveLogEntry = {
  ts: string;
  dateKey: string;
  convId: string;
  trigger: ProactiveLogTrigger;
  status: ProactiveLogStatus;
  preview: string;
  reason?: string;
};

type ProactiveProfile = {
  convId: string;
  riskHour: number;
  updatedAtTs: string;
};

export type ProactiveSettings = {
  dailyCheckinEnabled: boolean;
  dailyCheckinTime: string;
};

export type ProactiveRunResult = {
  sent: number;
  skipped: number;
  failed: number;
  entries: ProactiveLogEntry[];
};

export type ProactiveKpis = {
  todaySends: number;
  skippedWindowClosed: number;
  openWindows: number;
  pendingTriggers: number;
};

const dataDir = path.join(process.cwd(), "data");
const profilesPath = path.join(dataDir, "profiles.json");
const proactiveLogPath = path.join(dataDir, "proactive-log.json");
const proactiveSettingsPath = path.join(dataDir, "proactive-settings.json");
const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

const defaultSettings: ProactiveSettings = {
  dailyCheckinEnabled: true,
  dailyCheckinTime: "17:30",
};

const riskHourRegex = /\b(\d{1,2})[:.](\d{2})\b/g;

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function trimPreview(input: string): string {
  const text = String(input ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= 140) {
    return text;
  }
  return `${text.slice(0, 137)}...`;
}

function parseTime(input: string): { hour: number; minute: number } {
  const raw = String(input ?? "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return { hour: 17, minute: 30 };
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { hour: 17, minute: 30 };
  }

  return { hour, minute };
}

function isWithinLastSevenDays(isoTs: string): boolean {
  const ts = new Date(isoTs).getTime();
  if (!Number.isFinite(ts)) {
    return false;
  }
  return Date.now() - ts <= sevenDaysMs;
}

function extractRiskHour(text: string): number | null {
  const normalized = String(text ?? "");
  let found: number | null = null;

  for (const match of normalized.matchAll(riskHourRegex)) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      continue;
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      continue;
    }
    found = hour;
  }

  return found;
}

async function ensureProactiveFiles(): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(profilesPath);
  } catch {
    await fs.writeFile(profilesPath, "[]\n", "utf8");
  }

  try {
    await fs.access(proactiveLogPath);
  } catch {
    await fs.writeFile(proactiveLogPath, "[]\n", "utf8");
  }

  try {
    await fs.access(proactiveSettingsPath);
  } catch {
    await fs.writeFile(proactiveSettingsPath, `${JSON.stringify(defaultSettings, null, 2)}\n`, "utf8");
  }
}

async function readProfiles(): Promise<ProactiveProfile[]> {
  await ensureProactiveFiles();
  try {
    const raw = await fs.readFile(profilesPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry): entry is ProactiveProfile => (
        typeof entry === "object"
        && entry !== null
        && typeof (entry as { convId?: unknown }).convId === "string"
        && Number.isInteger((entry as { riskHour?: unknown }).riskHour)
        && typeof (entry as { updatedAtTs?: unknown }).updatedAtTs === "string"
      ))
      .map((entry) => ({
        convId: entry.convId,
        riskHour: Math.min(Math.max(entry.riskHour, 0), 23),
        updatedAtTs: entry.updatedAtTs,
      }));
  } catch {
    return [];
  }
}

async function writeProfiles(profiles: ProactiveProfile[]): Promise<void> {
  await ensureProactiveFiles();
  await fs.writeFile(profilesPath, `${JSON.stringify(profiles, null, 2)}\n`, "utf8");
}

async function readLogs(): Promise<ProactiveLogEntry[]> {
  await ensureProactiveFiles();
  try {
    const raw = await fs.readFile(proactiveLogPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry): entry is ProactiveLogEntry => (
        typeof entry === "object"
        && entry !== null
        && typeof (entry as { ts?: unknown }).ts === "string"
        && typeof (entry as { dateKey?: unknown }).dateKey === "string"
        && typeof (entry as { convId?: unknown }).convId === "string"
        && typeof (entry as { trigger?: unknown }).trigger === "string"
        && typeof (entry as { status?: unknown }).status === "string"
        && typeof (entry as { preview?: unknown }).preview === "string"
      ));
  } catch {
    return [];
  }
}

async function writeLogs(entries: ProactiveLogEntry[]): Promise<void> {
  await ensureProactiveFiles();
  await fs.writeFile(proactiveLogPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

async function appendLog(entry: ProactiveLogEntry): Promise<void> {
  const logs = await readLogs();
  logs.push(entry);
  await writeLogs(logs);
}

function alreadyLogged(logs: ProactiveLogEntry[], convId: string, trigger: ProactiveLogTrigger, dateKey: string): boolean {
  return logs.some((entry) => {
    if (entry.convId !== convId || entry.trigger !== trigger || entry.dateKey !== dateKey) {
      return false;
    }

    if (entry.status === "sent") {
      return true;
    }

    if (entry.status === "skipped" && (entry.reason ?? "").includes("window closed")) {
      return true;
    }

    return false;
  });
}

function shouldRunPatternNow(riskHour: number, now: Date): boolean {
  const targetMinutes = ((riskHour * 60) - 30 + (24 * 60)) % (24 * 60);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes === targetMinutes;
}

async function syncProfilesFromInboundPatterns(): Promise<ProactiveProfile[]> {
  const summaries = await getConversations();
  const existing = await readProfiles();
  const nextByConv = new Map<string, ProactiveProfile>(existing.map((entry) => [entry.convId, entry]));

  for (const summary of summaries) {
    const detail = await getConversation(summary.id);
    if (!detail) {
      continue;
    }

    let latestRiskHour: number | null = null;
    let latestTs = "";

    for (const event of detail.events) {
      if (event.direction !== "in") {
        continue;
      }

      const riskHour = extractRiskHour(event.text);
      if (riskHour === null) {
        continue;
      }

      latestRiskHour = riskHour;
      latestTs = event.ts;
    }

    if (latestRiskHour === null || !latestTs) {
      continue;
    }

    nextByConv.set(summary.id, {
      convId: summary.id,
      riskHour: latestRiskHour,
      updatedAtTs: latestTs,
    });
  }

  const nextProfiles = Array.from(nextByConv.values()).sort((a, b) => a.convId.localeCompare(b.convId));
  await writeProfiles(nextProfiles);
  return nextProfiles;
}

async function buildProactiveMessage(convId: string, trigger: ProactiveTrigger, riskHour: number | null): Promise<string> {
  const detail = await getConversation(convId);
  if (!detail) {
    throw new Error("Conversation not found.");
  }

  const config = await getConfig();
  const prompts = await getPrompts();

  const lastMessages = detail.events.slice(-6).map((event) => {
    const who = event.direction === "in" ? "Kullanici" : "Asistan";
    return `${who}: ${event.text}`;
  });

  const userPrompt = `Konusma ozeti: ${lastMessages.join(" | ")} | riskHour: ${riskHour ?? "yok"} | Tetikleyici: ${trigger}. Proaktif mesaji yaz.`;

  const text = await callLLM({
    provider: "anthropic",
    model: config.responder.model,
    system: prompts.proactivePrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  return trimPreview(text);
}

async function sendProactiveForConversation(args: {
  convId: string;
  trigger: ProactiveTrigger;
  dateKey: string;
  logs: ProactiveLogEntry[];
  riskHour: number | null;
}): Promise<ProactiveLogEntry> {
  const { convId, trigger, dateKey, logs, riskHour } = args;

  if (alreadyLogged(logs, convId, trigger, dateKey)) {
    return {
      ts: new Date().toISOString(),
      dateKey,
      convId,
      trigger,
      status: "skipped",
      preview: "",
      reason: "already sent today",
    };
  }

  const windowStatus = await getWindowStatus(convId);
  if (windowStatus === "closed") {
    const skippedEntry: ProactiveLogEntry = {
      ts: new Date().toISOString(),
      dateKey,
      convId,
      trigger,
      status: "skipped",
      preview: "",
      reason: "skipped (window closed)",
    };
    await appendLog(skippedEntry);
    return skippedEntry;
  }

  const to = await getConversationTarget(convId);
  if (!to) {
    const failedEntry: ProactiveLogEntry = {
      ts: new Date().toISOString(),
      dateKey,
      convId,
      trigger,
      status: "failed",
      preview: "",
      reason: "target not found",
    };
    await appendLog(failedEntry);
    return failedEntry;
  }

  const text = await buildProactiveMessage(convId, trigger, riskHour);

  try {
    await sendWhatsApp(to, text);

    await appendEvent({
      convId,
      ts: new Date().toISOString(),
      direction: "out",
      text,
      model: (await getConfig()).responder.model,
      meta: {
        proactive: true,
        trigger,
      },
    });

    const sentEntry: ProactiveLogEntry = {
      ts: new Date().toISOString(),
      dateKey,
      convId,
      trigger,
      status: "sent",
      preview: text,
    };
    await appendLog(sentEntry);
    return sentEntry;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedEntry: ProactiveLogEntry = {
      ts: new Date().toISOString(),
      dateKey,
      convId,
      trigger,
      status: "failed",
      preview: text,
      reason: message,
    };
    await appendLog(failedEntry);
    return failedEntry;
  }
}

async function logSilenceNudges(now: Date, logs: ProactiveLogEntry[]): Promise<ProactiveLogEntry[]> {
  const dateKey = toDateKey(now);
  const summaries = await getConversations();
  const entries: ProactiveLogEntry[] = [];

  for (const summary of summaries) {
    if (alreadyLogged(logs, summary.id, "silence_nudge", dateKey)) {
      continue;
    }

    const detail = await getConversation(summary.id);
    if (!detail) {
      continue;
    }

    const lastInbound = [...detail.events].reverse().find((event) => event.direction === "in");
    if (!lastInbound) {
      continue;
    }

    const lastInboundTs = new Date(lastInbound.ts).getTime();
    if (!Number.isFinite(lastInboundTs)) {
      continue;
    }

    const diffMs = now.getTime() - lastInboundTs;
    const minMs = 24 * 60 * 60 * 1000;
    const maxMs = 72 * 60 * 60 * 1000;

    if (diffMs < minMs || diffMs > maxMs) {
      continue;
    }

    const entry: ProactiveLogEntry = {
      ts: new Date().toISOString(),
      dateKey,
      convId: summary.id,
      trigger: "silence_nudge",
      status: "skipped",
      preview: "",
      reason: "skipped (template needed)",
    };
    await appendLog(entry);
    entries.push(entry);
  }

  return entries;
}

async function runDailyCheckin(now: Date, logs: ProactiveLogEntry[], settings: ProactiveSettings): Promise<ProactiveLogEntry[]> {
  if (!settings.dailyCheckinEnabled) {
    return [];
  }

  const { hour, minute } = parseTime(settings.dailyCheckinTime);
  if (now.getHours() !== hour || now.getMinutes() !== minute) {
    return [];
  }

  const dateKey = toDateKey(now);
  const summaries = await getConversations();
  const entries: ProactiveLogEntry[] = [];

  for (const summary of summaries) {
    if (!isWithinLastSevenDays(summary.lastTs)) {
      continue;
    }

    const sentOrSkipped = await sendProactiveForConversation({
      convId: summary.id,
      trigger: "daily_checkin",
      dateKey,
      logs,
      riskHour: null,
    });

    entries.push(sentOrSkipped);
  }

  return entries;
}

async function runPatternTrigger(now: Date, logs: ProactiveLogEntry[], profiles: ProactiveProfile[]): Promise<ProactiveLogEntry[]> {
  const dateKey = toDateKey(now);
  const todayStartKey = toDateKey(now);
  const entries: ProactiveLogEntry[] = [];

  for (const profile of profiles) {
    if (!shouldRunPatternNow(profile.riskHour, now)) {
      continue;
    }

    const updatedDateKey = toDateKey(new Date(profile.updatedAtTs));
    if (updatedDateKey === todayStartKey) {
      continue;
    }

    const entry = await sendProactiveForConversation({
      convId: profile.convId,
      trigger: "pattern",
      dateKey,
      logs,
      riskHour: profile.riskHour,
    });

    entries.push(entry);
  }

  return entries;
}

export async function getProactiveSettings(): Promise<ProactiveSettings> {
  await ensureProactiveFiles();
  try {
    const raw = await fs.readFile(proactiveSettingsPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ProactiveSettings>;
    return {
      dailyCheckinEnabled: parsed.dailyCheckinEnabled !== false,
      dailyCheckinTime: typeof parsed.dailyCheckinTime === "string" ? parsed.dailyCheckinTime : defaultSettings.dailyCheckinTime,
    };
  } catch {
    return { ...defaultSettings };
  }
}

export async function saveProactiveSettings(input: Partial<ProactiveSettings>): Promise<ProactiveSettings> {
  const current = await getProactiveSettings();
  const next: ProactiveSettings = {
    dailyCheckinEnabled: input.dailyCheckinEnabled === undefined ? current.dailyCheckinEnabled : Boolean(input.dailyCheckinEnabled),
    dailyCheckinTime: typeof input.dailyCheckinTime === "string" && input.dailyCheckinTime.trim().length > 0
      ? input.dailyCheckinTime.trim()
      : current.dailyCheckinTime,
  };

  await ensureProactiveFiles();
  await fs.writeFile(proactiveSettingsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function getProactiveLogs(limit = 200): Promise<ProactiveLogEntry[]> {
  const logs = await readLogs();
  const sorted = [...logs].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  return sorted.slice(0, Math.max(1, limit));
}

export async function runProactiveManualRound(): Promise<ProactiveRunResult> {
  const now = new Date();
  const dateKey = toDateKey(now);
  const logs = await readLogs();
  const profiles = await syncProfilesFromInboundPatterns();
  const summaries = await getConversations();
  const entries: ProactiveLogEntry[] = [];

  for (const summary of summaries) {
    if (!isWithinLastSevenDays(summary.lastTs)) {
      continue;
    }

    const riskHour = profiles.find((entry) => entry.convId === summary.id)?.riskHour ?? null;
    const entry = await sendProactiveForConversation({
      convId: summary.id,
      trigger: "manual",
      dateKey,
      logs,
      riskHour,
    });

    if (!(entry.status === "skipped" && entry.reason === "already sent today")) {
      entries.push(entry);
    }
  }

  const sent = entries.filter((entry) => entry.status === "sent").length;
  const skipped = entries.filter((entry) => entry.status === "skipped").length;
  const failed = entries.filter((entry) => entry.status === "failed").length;

  return { sent, skipped, failed, entries };
}

export async function runProactiveScheduledCycle(): Promise<ProactiveRunResult> {
  const now = new Date();
  const logs = await readLogs();
  const settings = await getProactiveSettings();
  const profiles = await syncProfilesFromInboundPatterns();

  const daily = await runDailyCheckin(now, logs, settings);
  const pattern = await runPatternTrigger(now, logs, profiles);
  const silence = await logSilenceNudges(now, logs);
  const entries = [...daily, ...pattern, ...silence];

  return {
    sent: entries.filter((entry) => entry.status === "sent").length,
    skipped: entries.filter((entry) => entry.status === "skipped").length,
    failed: entries.filter((entry) => entry.status === "failed").length,
    entries,
  };
}

export async function getProactiveKpis(): Promise<ProactiveKpis> {
  const [logs, summaries] = await Promise.all([readLogs(), getConversations()]);
  const todayKey = toDateKey(new Date());

  let openWindows = 0;
  for (const summary of summaries) {
    const status = await getWindowStatus(summary.id);
    if (status === "open") {
      openWindows += 1;
    }
  }

  const todayLogs = logs.filter((entry) => entry.dateKey === todayKey);
  const todaySends = todayLogs.filter((entry) => entry.status === "sent").length;
  const skippedWindowClosed = todayLogs.filter((entry) => entry.status === "skipped" && (entry.reason ?? "").includes("window closed")).length;

  const pendingTriggers = summaries.filter((summary) => isWithinLastSevenDays(summary.lastTs)).length - todaySends;

  return {
    todaySends,
    skippedWindowClosed,
    openWindows,
    pendingTriggers: Math.max(0, pendingTriggers),
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __forumProactiveSchedulerStarted: boolean | undefined;
}

export function startProactiveScheduler(): void {
  if (globalThis.__forumProactiveSchedulerStarted) {
    return;
  }

  globalThis.__forumProactiveSchedulerStarted = true;

  setInterval(() => {
    void runProactiveScheduledCycle();
  }, 60_000);
}
