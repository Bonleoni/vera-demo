import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CLAUDE_MASTER_PROMPT } from "@/lib/ai/claude-master-prompt";
import { OPENAI_SIMULATOR_PROMPT } from "@/lib/ai/openai-simulator-prompt";

type Provider = "openai" | "anthropic";

export type ModelConfig = {
  simulator: { provider: Provider; model: string };
  responder: { provider: Provider; model: string };
};

export type PromptConfig = {
  simulatorPrompt: string;
  responderPrompt: string;
  proactivePrompt: string;
};

const MODELS_PATH = path.join(process.cwd(), "config", "models.json");
const PROMPTS_PATH = path.join(process.cwd(), "prompts", "live-prompts.json");

const DEFAULT_MODELS: ModelConfig = {
  simulator: { provider: "openai", model: "gpt-4o-mini" },
  responder: { provider: "anthropic", model: "claude-sonnet-4-6" },
};

const DEFAULT_PROMPTS: PromptConfig = {
  simulatorPrompt: OPENAI_SIMULATOR_PROMPT,
  responderPrompt: CLAUDE_MASTER_PROMPT,
  proactivePrompt: "Sen samimi bir koçluk asistanısın. Kullanıcının geçmiş konuşmasını özet olarak biliyorsun. Görevin: 1-2 cümlelik, sıcak, arkadaşça bir check-in mesajı yazmak. Asla satış yapma, asla uzun yazma. Kullanıcının kendi kelimelerine/saatlerine atıf yap. Türkçe yaz.",
};

function safeString(input: unknown, fallback: string): string {
  return typeof input === "string" && input.trim().length > 0 ? input.trim() : fallback;
}

function normalizeModels(input: unknown): ModelConfig {
  const raw = input as Partial<ModelConfig> | undefined;
  return {
    simulator: {
      provider: raw?.simulator?.provider === "openai" ? "openai" : DEFAULT_MODELS.simulator.provider,
      model: safeString(raw?.simulator?.model, DEFAULT_MODELS.simulator.model),
    },
    responder: {
      provider: raw?.responder?.provider === "anthropic" ? "anthropic" : DEFAULT_MODELS.responder.provider,
      model: safeString(raw?.responder?.model, DEFAULT_MODELS.responder.model),
    },
  };
}

function normalizePrompts(input: unknown): PromptConfig {
  const raw = input as Partial<PromptConfig> | undefined;
  return {
    simulatorPrompt: safeString(raw?.simulatorPrompt, DEFAULT_PROMPTS.simulatorPrompt),
    responderPrompt: safeString(raw?.responderPrompt, DEFAULT_PROMPTS.responderPrompt),
    proactivePrompt: safeString(raw?.proactivePrompt, DEFAULT_PROMPTS.proactivePrompt),
  };
}

export function getDefaultModels(): ModelConfig {
  return { ...DEFAULT_MODELS, simulator: { ...DEFAULT_MODELS.simulator }, responder: { ...DEFAULT_MODELS.responder } };
}

export function getDefaultPrompts(): PromptConfig {
  return { ...DEFAULT_PROMPTS };
}

export async function getConfig(): Promise<ModelConfig> {
  try {
    const raw = await readFile(MODELS_PATH, "utf8");
    return normalizeModels(JSON.parse(raw));
  } catch {
    return getDefaultModels();
  }
}

export async function saveConfig(cfg: ModelConfig): Promise<ModelConfig> {
  const normalized = normalizeModels(cfg);
  await mkdir(path.dirname(MODELS_PATH), { recursive: true });
  await writeFile(MODELS_PATH, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export async function getPrompts(): Promise<PromptConfig> {
  try {
    const raw = await readFile(PROMPTS_PATH, "utf8");
    return normalizePrompts(JSON.parse(raw));
  } catch {
    return getDefaultPrompts();
  }
}

export async function savePrompts(prompts: PromptConfig): Promise<PromptConfig> {
  const normalized = normalizePrompts(prompts);
  await mkdir(path.dirname(PROMPTS_PATH), { recursive: true });
  await writeFile(PROMPTS_PATH, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}
