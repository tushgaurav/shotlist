import "server-only";

import { createOpenRouter, type OpenRouterProvider } from "@openrouter/ai-sdk-provider";

let cached: { apiKey: string; provider: OpenRouterProvider } | null = null;

/** null until OPENROUTER_API_KEY is set. */
function provider(): OpenRouterProvider | null {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

  // Rebuilt when the key changes, e.g. after editing .env.local while `next dev` runs.
  if (cached?.apiKey !== apiKey) {
    cached = {
      apiKey,
      provider: createOpenRouter({
        apiKey,
        compatibility: "strict",
        appName: "Shotlist",
        appUrl: process.env.BETTER_AUTH_URL,
      }),
    };
  }
  return cached.provider;
}

export function aiEnabled() {
  return provider() !== null;
}

export function languageModel(modelId: string) {
  const configured = provider();
  if (!configured) throw new Error("OPENROUTER_API_KEY isn't set.");
  return configured.chat(modelId);
}
