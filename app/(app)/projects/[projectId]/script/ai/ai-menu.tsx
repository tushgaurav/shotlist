"use client";

import { BotIcon, ChevronDownIcon, FilmIcon, SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AI_MODELS, aiModel, isAiModelId } from "@/lib/ai/models";
import { shortcutLabel, useIsMac } from "@/lib/keyboard";

import { useAiModel, useInlineSuggestions } from "./use-ai-model";

export type AiControls = {
  /** OPENROUTER_API_KEY is set. */
  enabled: boolean;
  busy: boolean;
  onWrite: () => void;
  onDraft: () => void;
  assistantOpen: boolean;
  onToggleAssistant: () => void;
};

/** The toolbar's Write button and the menu beside it. */
export function AiToolbarControls({ ai, disabled }: { ai: AiControls; disabled: boolean }) {
  const isMac = useIsMac();
  const [model, setModel] = useAiModel();
  const [inline, setInline] = useInlineSuggestions();
  const off = disabled || !ai.enabled;

  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Write with AI"
            disabled={disabled || ai.busy}
            onClick={ai.onWrite}
            className="rounded-r-none"
          >
            <SparklesIcon data-icon="inline-start" className="text-primary" />
            <span className="hidden @3xl:inline">Write</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {ai.enabled ? "Write or rewrite with AI" : "AI writing isn't set up"}{" "}
          <Kbd>{shortcutLabel(["Mod", "K"], isMac)}</Kbd>
        </TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="AI options" disabled={disabled} className="w-6 rounded-l-none">
            <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {!ai.enabled && (
            <>
              <DropdownMenuLabel className="font-normal text-muted-foreground">
                AI writing is off. Set OPENROUTER_API_KEY on the server to turn it on.
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem disabled={off || ai.busy} onSelect={ai.onWrite}>
            <SparklesIcon />
            Write or rewrite…
            <DropdownMenuShortcut>{shortcutLabel(["Mod", "K"], isMac)}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={off || ai.busy} onSelect={ai.onDraft}>
            <FilmIcon />
            Draft from project details…
          </DropdownMenuItem>
          <DropdownMenuCheckboxItem disabled={off} checked={ai.assistantOpen} onCheckedChange={ai.onToggleAssistant}>
            Assistant
            <DropdownMenuShortcut>{shortcutLabel(["Mod", "J"], isMac)}</DropdownMenuShortcut>
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem disabled={off} checked={inline} onCheckedChange={(checked) => setInline(checked === true)}>
            Inline suggestions
          </DropdownMenuCheckboxItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={off}>
              <span className="flex-1">Model</span>
              <span className="text-xs text-muted-foreground">{aiModel(model).label}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-60">
              <DropdownMenuRadioGroup value={model} onValueChange={(value) => isAiModelId(value) && setModel(value)}>
                {AI_MODELS.map((option) => (
                  <DropdownMenuRadioItem key={option.id} value={option.id}>
                    <span className="flex flex-col">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.hint}</span>
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Shows or hides the assistant beside the page. */
export function AssistantToggle({ ai }: { ai: AiControls }) {
  const isMac = useIsMac();
  if (!ai.enabled) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Assistant"
          aria-pressed={ai.assistantOpen}
          className="aria-pressed:bg-muted"
          onClick={ai.onToggleAssistant}
        >
          <BotIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {ai.assistantOpen ? "Hide" : "Show"} the assistant <Kbd>{shortcutLabel(["Mod", "J"], isMac)}</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}
