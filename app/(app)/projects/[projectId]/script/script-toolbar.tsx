"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BoldIcon, ItalicIcon, KeyboardIcon, MonitorPlayIcon, PanelRightIcon, UnderlineIcon } from "lucide-react";

import { SaveStatusIndicator, type SaveTone } from "@/components/save-status";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { shortcutLabel, useIsMac } from "@/lib/keyboard";
import type { SaveStatus } from "@/lib/screenplay/draft-saver";
import { setElementType } from "@/lib/screenplay/editor/commands";
import { ELEMENT_LABELS, isElementType, SHORTCUT_ORDER } from "@/lib/screenplay/elements";
import type { TitlePage } from "@/lib/screenplay/types";

import { AiToolbarControls, AssistantToggle, type AiControls } from "./ai/ai-menu";
import { ExportMenu } from "./export-menu";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { TitlePageDialog } from "./title-page-dialog";

type Props = {
  editor: Editor | null;
  status: SaveStatus;
  scriptId: string;
  projectTitle: string;
  titlePage: TitlePage;
  onTitlePageSaved: (titlePage: TitlePage) => void;
  shotPanelOpen: boolean;
  onToggleShotPanel: () => void;
  onOpenTeleprompter: () => void;
  ai: AiControls;
};

export function ScriptToolbar({
  editor,
  status,
  shotPanelOpen,
  onToggleShotPanel,
  onOpenTeleprompter,
  ai,
  ...titlePageProps
}: Props) {
  const isMac = useIsMac();
  const state = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor && {
        type: editor.state.selection.$from.parent.type.name,
        bold: editor.isActive("bold"),
        italic: editor.isActive("italic"),
        underline: editor.isActive("underline"),
      },
  });

  const elementType = state && isElementType(state.type) ? state.type : undefined;
  const marks = [
    { name: "bold", label: "Bold", icon: BoldIcon, key: "B", run: () => editor?.chain().focus().toggleBold().run() },
    { name: "italic", label: "Italic", icon: ItalicIcon, key: "I", run: () => editor?.chain().focus().toggleItalic().run() },
    { name: "underline", label: "Underline", icon: UnderlineIcon, key: "U", run: () => editor?.chain().focus().toggleUnderline().run() },
  ] as const;

  return (
    <div className="border-b bg-background/95 backdrop-blur">
      <div className="flex h-12 items-center gap-1 px-3 sm:px-4">
        <Select
          value={elementType ?? ""}
          disabled={!editor}
          onValueChange={(value) => {
            if (editor && isElementType(value)) setElementType(value)(editor.state, editor.view.dispatch);
          }}
        >
          <SelectTrigger size="sm" className="w-40" aria-label="Element type">
            <SelectValue placeholder="Element">{elementType && ELEMENT_LABELS[elementType]}</SelectValue>
          </SelectTrigger>
          <SelectContent
            position="popper"
            align="start"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              editor?.commands.focus();
            }}
          >
            {SHORTCUT_ORDER.map((type, index) => (
              <SelectItem key={type} value={type}>
                {ELEMENT_LABELS[type]}
                <Kbd className="ml-auto">{shortcutLabel(["Mod", "Alt", String(index + 1)], isMac)}</Kbd>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="mx-1.5 h-5!" />

        {marks.map((mark) => (
          <Tooltip key={mark.name}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={mark.label}
                aria-pressed={state?.[mark.name] ?? false}
                disabled={!editor}
                className="aria-pressed:bg-muted"
                onClick={mark.run}
              >
                <mark.icon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {mark.label} <Kbd>{shortcutLabel(["Mod", mark.key], isMac)}</Kbd>
            </TooltipContent>
          </Tooltip>
        ))}

        <Separator orientation="vertical" className="mx-1.5 h-5!" />
        <AiToolbarControls ai={ai} disabled={!editor || status === "conflict"} />

        <div className="ml-auto flex items-center gap-1">
          <SaveStatusIndicator status={status} tone={STATUS_TONES[status]} label={STATUS_LABELS[status]} />
          <Separator orientation="vertical" className="mx-1.5 h-5!" />
          <TitlePageDialog {...titlePageProps} />
          <ExportMenu editor={editor} projectTitle={titlePageProps.projectTitle} titlePage={titlePageProps.titlePage} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" disabled={!editor} onClick={onOpenTeleprompter}>
                <MonitorPlayIcon data-icon="inline-start" />
                Teleprompter
              </Button>
            </TooltipTrigger>
            <TooltipContent>Opens in a new tab</TooltipContent>
          </Tooltip>
          <ShortcutsDialog ai={ai.enabled}>
            <Button variant="ghost" size="icon-sm" aria-label="Keyboard shortcuts">
              <KeyboardIcon />
            </Button>
          </ShortcutsDialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Shots for this scene"
                aria-pressed={shotPanelOpen}
                className="hidden aria-pressed:bg-muted @7xl:inline-flex"
                onClick={onToggleShotPanel}
              >
                <PanelRightIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{shotPanelOpen ? "Hide" : "Show"} shots for this scene</TooltipContent>
          </Tooltip>
          <AssistantToggle ai={ai} />
        </div>
      </div>
    </div>
  );
}

const STATUS_TONES: Record<SaveStatus, SaveTone> = {
  saved: "saved",
  saving: "saving",
  offline: "warning",
  error: "error",
  conflict: "error",
};

const STATUS_LABELS: Record<SaveStatus, string> = {
  saved: "Saved",
  saving: "Saving…",
  offline: "Offline — changes kept on this device",
  error: "Couldn't save — changes kept on this device",
  conflict: "Not saved — changed elsewhere",
};
