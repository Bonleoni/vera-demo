import { NextResponse } from "next/server";
import { getConfig, getPrompts } from "@/lib/config-store";
import { callLLM } from "@/lib/llm";

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_URL = "https://api.openai.com/v1/responses";
const OPENAI_CHARACTER_SCENARIO = "A 42-year-old woman living in Istanbul wants to find a sustainable weight-control service. She has struggled with her weight for several years. She has tried several diets and programs before, lost weight temporarily, and regained it. She is skeptical of unrealistic weight-loss promises and does not want another short-term diet. She is price-sensitive and wants to understand whether the service can realistically help her maintain long-term results. She is not ready to purchase immediately and wants to ask questions before making a decision.";
const OPENAI_CHARACTER_PROMPT = `You are generating a realistic simulated customer character for a conversation stress-test.

Based ONLY on the scenario, create one believable customer persona.

The character should behave like a real person, not like an AI assistant.

Return ONLY valid JSON.

Use exactly this structure:
{
  "name": "",
  "age": 0,
  "gender": "",
  "location": "",
  "occupation": "",
  "personality": [],
  "communication_style": "",
  "knowledge_level": "",
  "motivation": "",
  "primary_goal": "",
  "concerns": [],
  "objections": [],
  "decision_factors": [],
  "behavior_traits": [],
  "initial_situation": ""
}

RULES:
- Do not invent information that is strongly inconsistent with the scenario.
- The character must be realistic.
- Personality must contain 3-5 traits.
- Concerns must contain 2-5 items.
- Objections must contain 2-5 items.
- Decision factors must contain 2-5 items.
- Behavior traits must contain 2-5 items.
- age must be a number.
- personality, concerns, objections, decision_factors and behavior_traits must be JSON arrays.
- Do not add any fields that are not specified above.
- Do not wrap the JSON in markdown code fences.
- Return valid JSON only.`;

function extractOpenAiText(data: any): string {
  const outputText = data?.output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText.trim();
  }

  const output = Array.isArray(data?.output) ? data.output : [];
  const text = output
    .flatMap((item: any) => item?.content ?? [])
    .map((item: any) => item?.text ?? "")
    .join("\n")
    .trim();

  return text || "OpenAI response received.";
}

function parseJsonResponse(responseText: string): any {
  const trimmed = responseText.trim();
  const withoutFences = trimmed.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    return JSON.parse(withoutFences);
  } catch {
    const firstBraceIndex = withoutFences.indexOf("{");
    const lastBraceIndex = withoutFences.lastIndexOf("}");

    if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
      return JSON.parse(withoutFences.slice(firstBraceIndex, lastBraceIndex + 1));
    }

    throw new Error("OpenAI response was not valid JSON.");
  }
}

function createSessionId(): string {
  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const timeStamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `FORUM-${dateStamp}-${timeStamp}-${suffix}`;
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

  text = text.replace(/\s+/g, " ").trim();
  return text;
}

async function extractClaudeText(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      error?: { message?: string };
      usage?: { input_tokens?: number; output_tokens?: number };
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

async function callClaude({
  claudeKey,
  model,
  claudeMasterPrompt,
  messages,
}: {
  claudeKey: string;
  model: string;
  claudeMasterPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const response = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": claudeKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 256,
      temperature: 0,
      system: claudeMasterPrompt,
      messages,
    }),
  });

  const responseText = await extractClaudeText(response);

  return {
    ok: response.ok,
    responseText,
    model,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      provider?: string;
      message?: string;
      firstMessage?: string;
      claudeMasterPrompt?: string;
      characterContext?: string;
      userMessage?: string;
      secondUserMessage?: string;
      scenario?: string;
      turns?: number;
    };
    const config = await getConfig();
    const prompts = await getPrompts();
    const simulatorModel = config.simulator.model;
    const responderModel = config.responder.model;

    if (body.provider === "openai") {
      const model = simulatorModel;
      const message = typeof body.message === "string" && body.message.trim().length > 0
        ? body.message.trim()
        : "Reply with exactly: OPENAI_CONNECTION_OK";

      const responseText = await callLLM({
        provider: "openai",
        model,
        messages: [{ role: "user", content: message }],
      });

      return NextResponse.json({
        ok: true,
        status: "SUCCESS",
        model,
        response: responseText,
      });
    }

    if (body.provider === "openai-character") {
      const model = simulatorModel;
      const scenario = typeof body.scenario === "string" && body.scenario.trim().length > 0
        ? body.scenario.trim()
        : OPENAI_CHARACTER_SCENARIO;
      const responseText = await callLLM({
        provider: "openai",
        model,
        system: OPENAI_CHARACTER_PROMPT,
        messages: [{ role: "user", content: `SCENARIO:\n${scenario}` }],
      });

      try {
        const parsedCharacter = parseJsonResponse(responseText);

        return NextResponse.json({
          ok: true,
          status: "SUCCESS",
          model,
          scenario,
          character: parsedCharacter,
          rawResponse: responseText,
        });
      } catch (error) {
        return NextResponse.json({
          status: "FAILED",
          error: error instanceof Error ? error.message : "OpenAI returned invalid JSON.",
          scenario,
          rawResponse: responseText,
        }, { status: 500 });
      }
    }

    if (body.provider === "openai-claude-first-response") {
      const claudeKey = process.env.ANTHROPIC_API_KEY;
      const openAiModel = simulatorModel;
      const claudeModel = responderModel;
      const scenario = typeof body.scenario === "string" && body.scenario.trim().length > 0
        ? body.scenario.trim()
        : OPENAI_CHARACTER_SCENARIO;
      const claudeMasterPrompt = typeof body.claudeMasterPrompt === "string" && body.claudeMasterPrompt.trim().length > 0
        ? body.claudeMasterPrompt.trim()
        : prompts.responderPrompt;

      if (!claudeKey) {
        return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
      }

      const openAiText = await callLLM({
        provider: "openai",
        model: openAiModel,
        system: OPENAI_CHARACTER_PROMPT,
        messages: [{ role: "user", content: `SCENARIO:\n${scenario}` }],
      });

      let character;
      try {
        character = parseJsonResponse(openAiText);
      } catch (error) {
        return NextResponse.json({
          status: "FAILED",
          error: error instanceof Error ? error.message : "OpenAI returned invalid JSON.",
          scenario,
          rawResponse: openAiText,
        }, { status: 500 });
      }

      const initialMessage = "Merhaba, saç ekimi düşünüyorum ama açıkçası biraz çekincelerim var. Daha önce iki klinikle görüştüm fakat karar veremedim. Öncelikle süreç, sonuçlar ve toplam maliyet hakkında daha net bilgi almak istiyorum.";

      const claudeText = await callLLM({
        provider: "anthropic",
        model: claudeModel,
        system: `${claudeMasterPrompt}\n\nYou are simulating this customer character. Respond as the character, not as an assistant. Stay consistent with the character's personality, concerns, objections, knowledge level and communication style. Do not explain that you are an AI or that you are simulating a character.`,
        messages: [
          {
            role: "user",
            content: `CHARACTER CONTEXT:\n${JSON.stringify(character, null, 2)}\n\nINITIAL USER MESSAGE:\n${initialMessage}`,
          },
        ],
      });

      return NextResponse.json({
        ok: true,
        status: "SUCCESS",
        scenario,
        character,
        openAiModel,
        claudeModel,
        initialMessage,
        claudeResponse: claudeText,
      });
    }

    if (body.provider === "openai-claude-two-turn") {
      const claudeKey = process.env.ANTHROPIC_API_KEY;
      const openAiModel = simulatorModel;
      const claudeModel = responderModel;
      const scenario = typeof body.scenario === "string" && body.scenario.trim().length > 0
        ? body.scenario.trim()
        : OPENAI_CHARACTER_SCENARIO;
      const firstMessage = typeof body.firstMessage === "string" ? body.firstMessage.trim() : "";
      const hasPresetFirstMessage = firstMessage.length > 0;
      const claudeMasterPrompt = typeof body.claudeMasterPrompt === "string" && body.claudeMasterPrompt.trim().length > 0
        ? body.claudeMasterPrompt.trim()
        : prompts.responderPrompt;
      const requestedTurns = Number.isInteger(body.turns)
        ? Math.min(Math.max(Number(body.turns), 2), 10)
        : 2;

      if (!claudeKey) {
        return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
      }

      const characterText = await callLLM({
        provider: "openai",
        model: openAiModel,
        system: OPENAI_CHARACTER_PROMPT,
        messages: [{ role: "user", content: `SCENARIO:\n${scenario}` }],
      });
      let character;
      try {
        character = parseJsonResponse(characterText);
      } catch (error) {
        return NextResponse.json({
          status: "FAILED",
          error: error instanceof Error ? error.message : "OpenAI returned invalid JSON.",
          scenario,
          rawResponse: characterText,
        }, { status: 500 });
      }

      const conversation: Array<{ turn: number; role: string; provider: string; message: string }> = [];
      const customerMessages: string[] = [];
      const assistantMessages: string[] = [];
      const sessionId = createSessionId();

      for (let turnIndex = 1; turnIndex <= requestedTurns; turnIndex += 1) {
        const isFirstTurn = turnIndex === 1;
        let customerMessage = "";

        if (hasPresetFirstMessage && isFirstTurn) {
          customerMessage = firstMessage;
          customerMessages.push(customerMessage);
          conversation.push({ turn: turnIndex, role: "customer", provider: "preset", message: customerMessage });
        } else {
          const simulatorContext = `SCENARIO:
${scenario}

CHARACTER JSON:
${JSON.stringify(character, null, 2)}

CHARACTER PERSONALITY:
${Array.isArray(character.personality) ? character.personality.join(", ") : ""}

COMMUNICATION STYLE:
${character.communication_style ?? ""}

KNOWLEDGE LEVEL:
${character.knowledge_level ?? ""}

MOTIVATION:
${character.motivation ?? ""}

PRIMARY GOAL:
${character.primary_goal ?? ""}

CONCERNS:
${Array.isArray(character.concerns) ? character.concerns.join("; ") : ""}

OBJECTIONS:
${Array.isArray(character.objections) ? character.objections.join("; ") : ""}

DECISION FACTORS:
${Array.isArray(character.decision_factors) ? character.decision_factors.join("; ") : ""}

BEHAVIOR TRAITS:
${Array.isArray(character.behavior_traits) ? character.behavior_traits.join("; ") : ""}

INITIAL SITUATION:
${character.initial_situation ?? ""}`;

          const customerPrompt = isFirstTurn
            ? simulatorContext
            : `${simulatorContext}

CONVERSATION HISTORY:
${customerMessages.map((message, index) => `CUSTOMER ${index + 1}:\n${message}`).join("\n\n")}

${assistantMessages.map((message, index) => `ASSISTANT ${index + 1}:\n${message}`).join("\n\n")}

LATEST ASSISTANT MESSAGE:
${assistantMessages[assistantMessages.length - 1] ?? ""}`;

          customerMessage = (await callLLM({
            provider: "openai",
            model: openAiModel,
            system: prompts.simulatorPrompt,
            messages: [{ role: "user", content: customerPrompt }],
          })).trim();
          customerMessages.push(customerMessage);
          conversation.push({ turn: turnIndex, role: "customer", provider: "openai", message: customerMessage });
        }

        const claudeMessages: Array<{ role: "user" | "assistant"; content: string }> = [
          {
            role: "user",
            content: `CHARACTER CONTEXT:\n${JSON.stringify(character, null, 2)}\n\nCONVERSATION HISTORY:\n${customerMessages.map((message, index) => `CUSTOMER TURN ${index + 1}:\n${message}`).join("\n\n")}${assistantMessages.length > 0 ? `\n\n${assistantMessages.map((message, index) => `ASSISTANT TURN ${index + 1}:\n${message}`).join("\n\n")}` : ""}\n\nCURRENT USER MESSAGE:\n${customerMessage}`,
          },
        ];

        const claudeResponseText = await callLLM({
          provider: "anthropic",
          model: claudeModel,
          system: `${claudeMasterPrompt}\n\nYou are the assistant answering this customer. Stay consistent with the scenario and the character context. Respond as a helpful assistant, not as the customer.`,
          messages: claudeMessages,
        });

        assistantMessages.push(claudeResponseText);
        conversation.push({ turn: turnIndex, role: "assistant", provider: "claude", message: claudeResponseText });
      }

      const finalCustomerMessages = conversation.filter((entry) => entry.role === "customer").map((entry) => entry.message);
      const finalAssistantMessages = conversation.filter((entry) => entry.role === "assistant").map((entry) => entry.message);

      return NextResponse.json({
        ok: true,
        status: "SUCCESS",
        sessionId,
        turns: requestedTurns,
        scenario,
        character,
        openAiModel,
        claudeModel,
        openAiCalls: 1 + requestedTurns,
        claudeCalls: requestedTurns,
        conversation,
        openAiCharacterMessages: finalCustomerMessages,
        claudeResponses: finalAssistantMessages,
      });
    }

    const claudeMasterPrompt = typeof body.claudeMasterPrompt === "string" && body.claudeMasterPrompt.trim().length > 0
      ? body.claudeMasterPrompt.trim()
      : prompts.responderPrompt;

    const characterContext = typeof body.characterContext === "string" && body.characterContext.trim().length > 0
      ? body.characterContext.trim()
      : `Name: Ayşe
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

    const userMessage = typeof body.userMessage === "string" && body.userMessage.trim().length > 0
      ? body.userMessage.trim()
      : "Merhaba. Kilo vermek istiyorum ama daha önce birkaç farklı diyet denedim ve hiçbirisi uzun süre işe yaramadı. Bana gerçekten nasıl yardımcı olabileceğinizi anlamak istiyorum.";

    const secondUserMessage = typeof body.secondUserMessage === "string" && body.secondUserMessage.trim().length > 0
      ? body.secondUserMessage.trim()
      : "Anladım ama bana daha önce de benzer şeyler söylendi. Gerçekten işe yarayacağını nasıl anlayabilirim?";

    const claudeKey = process.env.ANTHROPIC_API_KEY;
    const model = responderModel;

    if (!claudeKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
    }

    const firstCall = await callClaude({
      claudeKey,
      model,
      claudeMasterPrompt,
      messages: [{ role: "user", content: `CHARACTER CONTEXT:\n${characterContext}\n\nINITIAL USER MESSAGE:\n${userMessage}` }],
    });

    if (!firstCall.ok) {
      return NextResponse.json({
        status: "FAILED",
        failedCall: 1,
        error: firstCall.responseText,
      }, { status: 500 });
    }

    const firstResponse = firstCall.responseText;

    const secondCall = await callClaude({
      claudeKey,
      model,
      claudeMasterPrompt,
      messages: [
        { role: "user", content: `CHARACTER CONTEXT:\n${characterContext}\n\nINITIAL USER MESSAGE:\n${userMessage}` },
        { role: "assistant", content: firstResponse },
        { role: "user", content: secondUserMessage },
      ],
    });

    if (!secondCall.ok) {
      return NextResponse.json({
        status: "FAILED",
        failedCall: 2,
        error: secondCall.responseText,
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      status: "SUCCESS",
      model,
      calls: 2,
      conversation: [
        { role: "user", content: userMessage },
        { role: "assistant", content: firstResponse },
        { role: "user", content: secondUserMessage },
        { role: "assistant", content: secondCall.responseText },
      ],
    });
  } catch (error) {
    return NextResponse.json(
      { status: "FAILED", error: error instanceof Error ? error.message : "Claude conversation test failed." },
      { status: 500 },
    );
  }
}



