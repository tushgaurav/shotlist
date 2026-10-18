/** OpenRouter models offered for writing. All support structured output and tool calls. */
export const AI_MODELS = [
  { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5", hint: "Recommended" },
  { id: "anthropic/claude-opus-5.5", label: "Claude Opus 5.5", hint: "Most capable, slower" },
  { id: "openai/gpt-6.1-sol", label: "GPT-6.1 Sol", hint: "OpenAI" },
  { id: "google/gemini-4-argon", label: "Gemini 4 Argon", hint: "Google" },
  { id: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", hint: "Fastest, cheapest" },
] as const;

export type AiModel = (typeof AI_MODELS)[number];
export type AiModelId = AiModel["id"];

export const AI_MODEL_IDS = AI_MODELS.map((model) => model.id) as [AiModelId, ...AiModelId[]];

export const DEFAULT_AI_MODEL: AiModelId = "anthropic/claude-sonnet-5.5";

/** Ghost text needs to come back while you're still looking at the line, so it uses a small model. */
export const GHOST_TEXT_MODEL = "anthropic/claude-haiku-5.5";

export function isAiModelId(value: unknown): value is AiModelId {
  return AI_MODELS.some((model) => model.id === value);
}

export function aiModel(id: AiModelId): AiModel {
  return AI_MODELS.find((model) => model.id === id) ?? AI_MODELS[0];
}
