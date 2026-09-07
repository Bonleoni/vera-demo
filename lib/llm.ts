const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

type Provider = "openai" | "anthropic";

type LlmMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CallLlmOptions = {
  provider: Provider;
  model: string;
  system?: string;
  messages: LlmMessage[];
};

export async function callLLM(opts: CallLlmOptions): Promise<string> {
  if (!opts.model || opts.model.trim().length === 0) {
    throw new Error("LLM model is required.");
  }

  if (!Array.isArray(opts.messages) || opts.messages.length === 0) {
    throw new Error("At least one message is required.");
  }

  if (opts.provider === "openai") {
    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }

    const openAiMessages = [
      ...(opts.system && opts.system.trim().length > 0 ? [{ role: "system", content: opts.system.trim() }] : []),
      ...opts.messages,
    ];

    const response = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: openAiMessages,
        temperature: 0,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error?.message ?? `OpenAI API request failed (${response.status}).`);
    }

    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new Error("OpenAI response did not include text content.");
    }

    return text.trim();
  }

  const claudeKey = process.env.ANTHROPIC_API_KEY;
  if (!claudeKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": claudeKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 1024,
      temperature: 0,
      system: opts.system ?? "",
      messages: opts.messages,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message ?? `Anthropic API request failed (${response.status}).`);
  }

  const text = (Array.isArray(data?.content) ? data.content : [])
    .filter((entry: any) => entry?.type === "text")
    .map((entry: any) => entry?.text ?? "")
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Anthropic response did not include text content.");
  }

  return text;
}
