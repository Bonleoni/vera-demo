import { NextResponse } from "next/server";
import { getConfig, getPrompts } from "@/lib/config-store";
import { callLLM } from "@/lib/llm";

type ChatHistoryItem = {
  role: "customer" | "assistant";
  message: string;
};

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

async function extractClaudeText(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return cleanupClaudeResponseText(`Claude API error: ${response.status} ${JSON.stringify(data?.error ?? data ?? {})}`);
    }

    const text = data.content
      ?.filter((item) => item.type === "text")
      .map((item) => item.text ?? "")
      .join("\n")
      .trim();

    return cleanupClaudeResponseText(text || "Claude response received.");
  } catch {
    return cleanupClaudeResponseText(`Claude API error: unable to parse response from ${response.status}.`);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      history?: ChatHistoryItem[];
      userMessage?: string;
    };

    const userMessage = typeof body.userMessage === "string" ? body.userMessage.trim() : "";
    if (!userMessage) {
      return NextResponse.json({ error: "userMessage is required." }, { status: 500 });
    }

    const history = Array.isArray(body.history)
      ? body.history
        .filter((entry) => (entry.role === "customer" || entry.role === "assistant") && typeof entry.message === "string" && entry.message.trim().length > 0)
        .map((entry) => ({ role: entry.role, message: entry.message.trim() }))
      : [];

    const config = await getConfig();
    const prompts = await getPrompts();

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...history.map((entry): { role: "user" | "assistant"; content: string } => ({
        role: entry.role === "customer" ? "user" : "assistant",
        content: entry.message,
      })),
      { role: "user", content: userMessage },
    ];

    const reply = await callLLM({
      provider: "anthropic",
      model: config.responder.model,
      system: prompts.responderPrompt,
      messages,
    });

    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Manual chat request failed." },
      { status: 500 },
    );
  }
}
