import { NextResponse } from "next/server";

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";

async function extractClaudeText(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return `Claude API error: ${response.status} ${JSON.stringify(data?.error ?? data ?? {})}`;
    }

    const text = data.content
      ?.filter((item) => item.type === "text")
      .map((item) => item.text ?? "")
      .join("\n")
      .trim();

    return text || "Claude response received.";
  } catch {
    return `Claude API error: unable to parse response from ${response.status}.`;
  }
}

function cleanClaudeJsonText(raw: string): string {
  let cleaned = raw.trim();

  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring("```json".length).trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3).trim();
  }

  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3).trim();
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1).trim();
  }

  return cleaned;
}

function parseEvaluationResponse(raw: string): { status: "ok" | "failed"; score: number | null; reason: string } {
  const attempts = Array.from(new Set([raw, cleanClaudeJsonText(raw)])).filter(Boolean);

  for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
    const candidate = attempts[attemptIndex]?.trim();
    if (!candidate) {
      continue;
    }

    try {
      const parsed = JSON.parse(candidate) as { score?: number; reason?: string };
      const score = Number(parsed.score);
      const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";

      if (!Number.isFinite(score) || score < 1 || score > 10) {
        throw new Error("Invalid evaluation score.");
      }

      return {
        status: "ok",
        score: Math.round(score),
        reason: reason || "Asistanın iletişimi ve müşteri yaklaşımı genel olarak olumlu yönde ilerledi.",
      };
    } catch {
      // Retry with stricter extraction before failing.
    }
  }

  return {
    status: "failed",
    score: null,
    reason: "Evaluation failed — retry",
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      conversation?: Array<{ turn?: number; role?: string; provider?: string; message?: string }>;
    };

    const conversation = Array.isArray(body.conversation) ? body.conversation : [];
    if (conversation.length === 0) {
      return NextResponse.json({
        score: 0,
        reason: "Değerlendirme için konuşma verisi bulunamadı.",
      });
    }

    const claudeKey = process.env.ANTHROPIC_API_KEY;
    const claudeModel = process.env.FORUM_CLAUDE_MODEL ?? "claude-sonnet-4-6";

    if (!claudeKey) {
      return NextResponse.json({
        score: 0,
        reason: "Değerlendirme sırasında bir hata oluştu.",
      }, { status: 500 });
    }

    const messageText = conversation
      .map((entry) => {
        const label = entry.role === "assistant" ? "ASISTAN" : entry.role === "customer" ? "MÜŞTERİ" : "KAYIT";
        return `${label}: ${entry.message ?? ""}`;
      })
      .join("\n\n");

    const requestPayload = {
      model: claudeModel,
      max_tokens: 256,
      temperature: 0,
      system: "You are an evaluation expert for a CONSULTATIVE (non-aggressive) sales\napproach on WhatsApp. Our philosophy: first value, then trust, then\nservice. Early selling is an ERROR; discovery and WOW moments are SUCCESS.\n\nEvaluate the assistant (Claude) on these criteria, in this order:\n\n1. WOW MOMENT: Did the assistant catch a pattern/insight from the\n   customer's words? Did the customer confirm naturally with phrases like\n   \"Evet, tam olarak böyle\", \"Bunu hiç böyle düşünmemiştim\",\n   \"Aslında benim sorunum biraz da bu\"? If yes, WOW happened — reward it.\n\n2. EARLY SELLING ERROR: Did the assistant mention service, price, package,\n   or a CTA before the customer asked, or before turn 5? If yes, heavy\n   penalty.\n\n3. RIGHT-TIMED TRANSITION: When the customer showed interest (asked,\n   opened up), did the assistant transition softly, without pressure?\n   NOT transitioning is NOT an error. Pushing IS an error.\n   NEVER say \"satış fırsatı kaçırıldı\" — not selling in the first 4-5\n   turns is the CORRECT behavior.\n\n4. WHATSAPP STYLE: Short messages (1-3 sentences), no lists/markdown,\n   at most one question per message.\n\n5. LISTENING/PERSONALIZATION: Did the assistant use the customer's\n   earlier words and details?\n\nScore 1-10 and write a 2-3 sentence Turkish reason.\n\nAnswer ONLY in this JSON format:\n{\"score\": <1-10 number>, \"reason\": \"<2-3 cümlelik Türkçe gerekçe>\"}",
      messages: [
        {
          role: "user",
          content: `KONUŞMA:
${messageText}`,
        },
      ],
    };

    let response = await fetch(CLAUDE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": claudeKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(requestPayload),
    });

    let responseText = await extractClaudeText(response);

    if (!response.ok) {
      return NextResponse.json({
        status: "evaluation_failed",
        score: null,
        reason: "Evaluation failed — retry",
      }, { status: 500 });
    }

    let parsed = parseEvaluationResponse(responseText);
    if (parsed.status === "failed") {
      response = await fetch(CLAUDE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": claudeKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(requestPayload),
      });

      responseText = await extractClaudeText(response);

      if (!response.ok) {
        return NextResponse.json({
          status: "evaluation_failed",
          score: null,
          reason: "Evaluation failed — retry",
        }, { status: 500 });
      }

      parsed = parseEvaluationResponse(responseText);
      if (parsed.status === "failed") {
        return NextResponse.json({
          status: "evaluation_failed",
          score: null,
          reason: parsed.reason,
        }, { status: 200 });
      }
    }

    return NextResponse.json(parsed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Evaluation failed — retry";
    return NextResponse.json({
      status: "evaluation_failed",
      score: null,
      reason,
    }, { status: 500 });
  }
}
