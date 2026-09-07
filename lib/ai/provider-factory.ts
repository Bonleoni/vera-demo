import "server-only";

import type { AIProvider } from "@/lib/ai/provider";
import { ClaudeAIProvider } from "@/lib/ai/claude-provider";
import { MockAIProvider } from "@/lib/ai/mock-provider";

type ProviderMode = "mock" | "claude";

function getProviderMode(): ProviderMode {
  const mode = (process.env.FORUM_AI_PROVIDER ?? "mock").toLowerCase();
  return mode === "claude" ? "claude" : "mock";
}

export function resolveAIProvider(): AIProvider {
  const mode = getProviderMode();

  if (mode === "claude") {
    return new ClaudeAIProvider();
  }

  return new MockAIProvider();
}
