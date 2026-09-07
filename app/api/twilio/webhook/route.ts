import { NextResponse } from "next/server";
import { getConfig, getPrompts } from "@/lib/config-store";
import { callLLM } from "@/lib/llm";
import { appendEvent, resolveConversationId } from "@/lib/conversation-store";

const historyBySender = new Map<string, Array<{ role: "customer" | "assistant"; message: string }>>();

function escapeXml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cleanupClaudeResponseText(rawText: string): string {
  let text = String(rawText ?? "").replace(/\r/g, "").replace(/\u00A0/g, " ").trim();
  text = text.replace(/\s+/g, " ").trim();

  const tailRepeatPattern = /(.+?)(\b.+\b)\2+$/i;
  if (tailRepeatPattern.test(text)) {
    text = text.replace(tailRepeatPattern, "$1$2");
  }

  for (let chunkLength = Math.min(180, Math.max(12, Math.floor(text.length / 2))); chunkLength >= 12; chunkLength -= 1) {
    const suffix = text.slice(-chunkLength);
    const prefix = text.slice(0, -chunkLength);

    if (prefix.length > 0 && prefix.endsWith(suffix)) {
      text = prefix.trim();
      break;
    }
  }

  const partialRepeatPattern = /([.!?]\s*[A-Za-zÇŞÖĞÜçşöğü0-9'"\-]+?)(\s+\1)+$/i;
  if (partialRepeatPattern.test(text)) {
    text = text.replace(partialRepeatPattern, "$1");
  }

  return text.replace(/\s+/g, " ").trim();
}

function buildTwiml(): string {
  return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>";
}

function buildTwimlMessage(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const formData = await request.formData();
    const from = String(formData.get("From") ?? "").trim();
    const to = String(formData.get("To") ?? "").trim();
    const body = String(formData.get("Body") ?? "").trim();

    if (!from || !body) {
      return new NextResponse(buildTwiml(), {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=UTF-8" },
      });
    }

    const config = await getConfig();
    const prompts = await getPrompts();
    const convId = await resolveConversationId(from);

    console.log("[twilio-webhook] incoming", JSON.stringify({ from, to, body }));

    try {
      await appendEvent({
        convId,
        ts: new Date().toISOString(),
        direction: "in",
        text: body,
      });
    } catch (error) {
      console.log("[twilio-webhook] store-in error", error instanceof Error ? error.message : String(error));
    }

    const history = historyBySender.get(from) ?? [];
    const mappedHistory: Array<{ role: "user" | "assistant"; content: string }> = history.map((entry) => ({
      role: entry.role === "customer" ? "user" : "assistant",
      content: entry.message,
    }));
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...mappedHistory,
      { role: "user", content: body },
    ];

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), 12000);

    let reply = "";
    try {
      reply = await callLLM({
        provider: "anthropic",
        model: config.responder.model,
        system: prompts.responderPrompt,
        messages,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      console.log("[twilio-webhook] claude error", error instanceof Error ? error.message : String(error));
      return new NextResponse(buildTwiml(), {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=UTF-8" },
      });
    }

    clearTimeout(timeoutId);
    historyBySender.set(from, [
      ...history,
      { role: "customer", message: body },
      { role: "assistant", message: reply },
    ]);

    const durationMs = Date.now() - startedAt;
    console.log("[twilio-webhook] outgoing", JSON.stringify({ from, model: config.responder.model, body: reply, durationMs }));

    try {
      await appendEvent({
        convId,
        ts: new Date().toISOString(),
        direction: "out",
        text: reply,
        latencyMs: durationMs,
        model: config.responder.model,
        meta: {
          proactive: false,
        },
      });
    } catch (error) {
      console.log("[twilio-webhook] store-out error", error instanceof Error ? error.message : String(error));
    }

    return new NextResponse(buildTwimlMessage(reply), {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=UTF-8" },
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.log("[twilio-webhook] failed", JSON.stringify({
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    }));

    return new NextResponse(buildTwiml(), {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=UTF-8" },
    });
  }
}