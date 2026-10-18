"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AI_MODELS, aiModel, isAiModelId } from "@/lib/ai/models";

import { useAiModel } from "./use-ai-model";

/** A compact model picker. The choice is shared by every AI feature and remembered. */
export function ModelSelect({ className }: { className?: string }) {
  const [model, setModel] = useAiModel();
  return (
    <Select value={model} onValueChange={(value) => isAiModelId(value) && setModel(value)}>
      <SelectTrigger size="sm" aria-label="AI Model" className={className ?? "h-7 min-w-0 border-none px-2 text-xs text-muted-foreground shadow-none hover:bg-muted dark:bg-transparent"}>
        <SelectValue>
          <span className="truncate">{aiModel(model).label}</span>
        </SelectValue>
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
