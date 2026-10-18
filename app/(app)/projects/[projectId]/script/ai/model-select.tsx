"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AI_MODELS, aiModel, isAiModelId } from "@/lib/ai/models";

import { useAiModel } from "./use-ai-model";

/** A compact model picker. The choice is shared by every AI feature and remembered. */
export function ModelSelect({ className }: { className?: string }) {
  const [model, setModel] = useAiModel();
  return (
    <Select value={model} onValueChange={(value) => isAiModelId(value) && setModel(value)}>
      <SelectTrigger size="sm" aria-label="AI model" className={className ?? "h-7 border-none px-2 text-xs text-muted-foreground shadow-none hover:bg-muted dark:bg-transparent"}>
        <SelectValue>{aiModel(model).label}</SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {AI_MODELS.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            <span className="flex flex-col">
              <span>{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
