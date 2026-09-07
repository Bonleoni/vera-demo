import { promises as fs } from "fs";
import path from "path";

type Direction = "in" | "out";

export type ProactiveTrigger = "daily_checkin" | "pattern" | "manual";

export type EventMeta = {
  proactive?: boolean;
  trigger?: ProactiveTrigger;
};

export type StoredEvent = {
  convId: string;
  ts: string;
  direction: Direction;
  text: string;
  latencyMs?: number;
  model?: string;
  meta?: EventMeta;
};

type ConversationIdMap = Record<string, string>;

export type ConversationSummary = {
  id: string;
  firstTs: string;
  lastTs: string;
  userMasked: string;
  msgCount: number;
  lastDirection: Direction;
  lastText: string;
  avgLatencyMs: number | null;
  status: "active" | "idle" | "completed";
};

export type ConversationDetail = {
  id: string;
  userMasked: string;
  events: StoredEvent[];
};

export type WindowStatus = "open" | "closed";

export type ConversationKpis = {
  todayMessages: number;
  activeConversations: number;
  avgResponseSec: number;
  totalConversations: number;
  activeUserRate: number;
  avgDepth: number;
};

const dataDir = path.join(process.cwd(), "data");
const eventsPath = path.join(dataDir, "conversations.jsonl");
const idsPath = path.join(dataDir, "conv-ids.json");

function normalizeSender(sender: string): string {
  const value = String(sender ?? "").trim();
  if (!value) {
    return "unknown";
  }

  const strippedPrefix = value.replace(/^whatsapp:/i, "").trim();
  if (strippedPrefix.startsWith("+")) {
    return strippedPrefix;
  }

  const digits = strippedPrefix.replace(/\D/g, "");
  return digits ? `+${digits}` : strippedPrefix;
}

function maskUser(sender: string): string {
  const normalized = normalizeSender(sender);
  const digits = normalized.replace(/\D/g, "");

  if (digits.length >= 10) {
    const local = digits.slice(-10);
    const countryDigits = digits.slice(0, -10);
    const country = countryDigits ? `+${countryDigits}` : "+";
    return `${country} ${local[0]}•• ••• ${local.slice(-3)}`;
  }

  if (normalized.length <= 4) {
    return normalized;
  }

  return `${normalized.slice(0, 2)}•••${normalized.slice(-2)}`;
}

async function ensureDataFiles(): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(eventsPath);
  } catch {
    await fs.writeFile(eventsPath, "", "utf8");
  }

  try {
    await fs.access(idsPath);
  } catch {
    await fs.writeFile(idsPath, "{}", "utf8");
  }
}

async function readIdMap(): Promise<ConversationIdMap> {
  await ensureDataFiles();
  const raw = await fs.readFile(idsPath, "utf8");
  const parsed = JSON.parse(raw || "{}") as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return parsed as ConversationIdMap;
}

async function writeIdMap(map: ConversationIdMap): Promise<void> {
  await fs.writeFile(idsPath, JSON.stringify(map, null, 2), "utf8");
}

export async function resolveConversationId(sender: string): Promise<string> {
  const normalized = normalizeSender(sender);
  const map = await readIdMap();

  if (map[normalized]) {
    return map[normalized];
  }

  let max = 0;
  for (const existingId of Object.values(map)) {
    const numeric = Number(existingId.replace("FRM-", ""));
    if (Number.isFinite(numeric)) {
      max = Math.max(max, numeric);
    }
  }

  const nextId = `FRM-${String(max + 1).padStart(6, "0")}`;
  map[normalized] = nextId;
  await writeIdMap(map);
  return nextId;
}

export async function appendEvent(event: StoredEvent): Promise<void> {
  await ensureDataFiles();
  const payload: StoredEvent = {
    convId: event.convId,
    ts: event.ts,
    direction: event.direction,
    text: event.text,
    ...(typeof event.latencyMs === "number" ? { latencyMs: event.latencyMs } : {}),
    ...(event.model ? { model: event.model } : {}),
    ...(event.meta && (event.meta.proactive !== undefined || event.meta.trigger)
      ? {
        meta: {
          ...(event.meta.proactive !== undefined ? { proactive: Boolean(event.meta.proactive) } : {}),
          ...(event.meta.trigger ? { trigger: event.meta.trigger } : {}),
        },
      }
      : {}),
  };
  await fs.appendFile(eventsPath, `${JSON.stringify(payload)}\n`, "utf8");
}

async function readEvents(): Promise<StoredEvent[]> {
  await ensureDataFiles();
  const raw = await fs.readFile(eventsPath, "utf8");

  const isStoredEvent = (value: StoredEvent | null): value is StoredEvent => (
    value !== null
    && typeof value.convId === "string"
    && typeof value.ts === "string"
    && (value.direction === "in" || value.direction === "out")
    && typeof value.text === "string"
  );

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        const parsed = JSON.parse(line) as StoredEvent;
        const withMeta: StoredEvent = {
          ...parsed,
          ...(parsed.meta && typeof parsed.meta === "object"
            ? {
              meta: {
                ...(typeof parsed.meta.proactive === "boolean" ? { proactive: parsed.meta.proactive } : {}),
                ...(parsed.meta.trigger === "daily_checkin" || parsed.meta.trigger === "pattern" || parsed.meta.trigger === "manual"
                  ? { trigger: parsed.meta.trigger }
                  : {}),
              },
            }
            : {}),
        };
        return withMeta;
      } catch {
        return null;
      }
    })
    .filter(isStoredEvent);
}

export async function getConversationTarget(convId: string): Promise<string | null> {
  const idMap = await readIdMap();
  const target = Object.entries(idMap).find(([, id]) => id === convId)?.[0] ?? null;
  return target;
}

export async function getWindowStatus(convId: string): Promise<WindowStatus> {
  const normalizedId = String(convId ?? "").trim();
  if (!normalizedId) {
    return "closed";
  }

  const events = await readEvents();
  const lastInbound = events
    .filter((event) => event.convId === normalizedId && event.direction === "in")
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())[0];

  if (!lastInbound) {
    return "closed";
  }

  const inboundTs = new Date(lastInbound.ts).getTime();
  if (!Number.isFinite(inboundTs)) {
    return "closed";
  }

  const diffMs = Date.now() - inboundTs;
  const windowMs = 24 * 60 * 60 * 1000;
  return diffMs < windowMs ? "open" : "closed";
}

function statusFromTs(lastTs: string): "active" | "idle" | "completed" {
  const last = new Date(lastTs).getTime();
  if (!Number.isFinite(last)) {
    return "completed";
  }

  const diffMs = Date.now() - last;
  const tenMinutesMs = 10 * 60 * 1000;
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (diffMs < tenMinutesMs) {
    return "active";
  }

  if (diffMs < oneDayMs) {
    return "idle";
  }

  return "completed";
}

function trimPreview(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 120) {
    return normalized;
  }
  return `${normalized.slice(0, 117)}...`;
}

export async function getConversations(): Promise<ConversationSummary[]> {
  const [events, idMap] = await Promise.all([readEvents(), readIdMap()]);
  const senderById = new Map<string, string>();

  for (const [sender, id] of Object.entries(idMap)) {
    senderById.set(id, sender);
  }

  const grouped = new Map<string, StoredEvent[]>();
  for (const event of events) {
    const bucket = grouped.get(event.convId) ?? [];
    bucket.push(event);
    grouped.set(event.convId, bucket);
  }

  const summaries: ConversationSummary[] = [];

  for (const [id, group] of grouped.entries()) {
    group.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    const first = group[0];
    const last = group[group.length - 1];

    const outLatencies = group
      .filter((entry) => entry.direction === "out" && typeof entry.latencyMs === "number")
      .map((entry) => Number(entry.latencyMs));

    const avgLatencyMs = outLatencies.length > 0
      ? Math.round(outLatencies.reduce((sum, value) => sum + value, 0) / outLatencies.length)
      : null;

    const sender = senderById.get(id) ?? "unknown";

    summaries.push({
      id,
      firstTs: first.ts,
      lastTs: last.ts,
      userMasked: maskUser(sender),
      msgCount: group.length,
      lastDirection: last.direction,
      lastText: trimPreview(last.text),
      avgLatencyMs,
      status: statusFromTs(last.ts),
    });
  }

  summaries.sort((a, b) => new Date(b.lastTs).getTime() - new Date(a.lastTs).getTime());
  return summaries;
}

export async function getConversation(id: string): Promise<ConversationDetail | null> {
  const [events, idMap] = await Promise.all([readEvents(), readIdMap()]);
  const normalizedId = String(id ?? "").trim();
  if (!normalizedId) {
    return null;
  }

  const related = events
    .filter((event) => event.convId === normalizedId)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  if (related.length === 0) {
    return null;
  }

  const senderEntry = Object.entries(idMap).find(([, convId]) => convId === normalizedId);
  const sender = senderEntry?.[0] ?? "unknown";

  return {
    id: normalizedId,
    userMasked: maskUser(sender),
    events: related,
  };
}

export async function getOperationKpis(): Promise<ConversationKpis> {
  const [events, summaries] = await Promise.all([readEvents(), getConversations()]);
  const today = new Date();

  const isSameDay = (value: string): boolean => {
    const date = new Date(value);
    return date.getFullYear() === today.getFullYear()
      && date.getMonth() === today.getMonth()
      && date.getDate() === today.getDate();
  };

  const todayMessages = events.filter((event) => isSameDay(event.ts)).length;
  const activeConversations = summaries.filter((summary) => summary.status === "active").length;

  const latencies = events
    .filter((event) => event.direction === "out" && typeof event.latencyMs === "number")
    .map((event) => Number(event.latencyMs));

  const avgResponseSec = latencies.length > 0
    ? Number((latencies.reduce((sum, value) => sum + value, 0) / latencies.length / 1000).toFixed(1))
    : 0;

  const totalConversations = summaries.length;
  const activeUsers = summaries.filter((summary) => summary.msgCount >= 3).length;
  const activeUserRate = totalConversations > 0
    ? Number(((activeUsers / totalConversations) * 100).toFixed(1))
    : 0;
  const avgDepth = totalConversations > 0
    ? Number((events.length / totalConversations).toFixed(1))
    : 0;

  return {
    todayMessages,
    activeConversations,
    avgResponseSec,
    totalConversations,
    activeUserRate,
    avgDepth,
  };
}
