import { DEFAULT_AI_MODEL, isAiModelId, type AiModelId } from "@/lib/ai/models";
import { useLocalStorage, writeLocalStorage } from "@/lib/use-local-storage";

const MODEL_KEY = "shotlist:ai-model";
const INLINE_KEY = "shotlist:ai-inline-suggestions";

/** The model the writer picked, remembered in this browser. */
export function useAiModel() {
  const stored = useLocalStorage(MODEL_KEY);
  const model: AiModelId = isAiModelId(stored) ? stored : DEFAULT_AI_MODEL;
  return [model, (id: AiModelId) => writeLocalStorage(MODEL_KEY, id)] as const;
}

/** Whether ghost text is on. It is unless the writer turned it off. */
export function useInlineSuggestions() {
  const enabled = useLocalStorage(INLINE_KEY) !== "off";
  return [enabled, (on: boolean) => writeLocalStorage(INLINE_KEY, on ? null : "off")] as const;
}
