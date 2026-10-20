"use client";

import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { cn } from "cn";
import {
  ArrowLeftIcon,
  BoldIcon,
  DownloadIcon,
  EllipsisIcon,
  HeadingIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  RotateCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { SaveStatusIndicator, type SaveTone } from "@/components/save-status";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SaveStatus } from "@/lib/draft-saver";
import { shortcutLabel, useIsMac } from "@/lib/keyboard";
import { noteSchemaExtensions } from "@/lib/notes/schema";

import type { NoteState } from "./notes-workspace";

import "./notes.css";

const noteEditorExtensions = () => [
  ...noteSchemaExtensions(),
  Placeholder.configure({ placeholder: "Start with a title, then anything: ideas, references, shots to get…" }),
];

const editorProps = { attributes: { "aria-label": "Note", spellcheck: "true", class: "note-content" } };

export function NoteEditor({
  note,
  status,
  autofocus,
  onChange,
  onDelete,
  onDownload,
  onBack,
  className,
}: {
  note: NoteState;
  status: SaveStatus;
  autofocus: boolean;
  onChange: (note: NoteState, doc: ProseMirrorNode) => void;
  onDelete: () => void;
  onDownload: () => void;
  onBack: () => void;
  className?: string;
}) {
  // Only read when the editor is created; the editor owns the document from then on.
  const [content] = useState(() => note.doc?.toJSON() ?? note.content);
  const [extensions] = useState(noteEditorExtensions);
  const editor = useEditor({
    extensions,
    content,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    autofocus: autofocus ? "end" : false,
    editorProps,
    onUpdate: ({ editor }) => onChange(note, editor.state.doc),
  });

  useEffect(() => {
    if (status === "conflict") editor?.setEditable(false);
  }, [editor, status]);

  return (
    <section aria-label="Note" className={cn("flex min-w-0 flex-1 flex-col", className)}>
      <div className="sticky top-12 z-30 flex h-12 shrink-0 items-center gap-1 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
        <Button variant="ghost" size="icon-sm" aria-label="All Notes" className="md:hidden" onClick={onBack}>
          <ArrowLeftIcon />
        </Button>
        {/* useEditorState keeps its first snapshot when the editor goes from null to ready. */}
        <FormatButtons key={editor ? "ready" : "loading"} editor={editor} disabled={status === "conflict"} />
        <div className="ml-auto flex items-center gap-1">
          <SaveStatusIndicator status={status} {...STATUS[status]} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Note Actions">
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem disabled={!note.text} onSelect={onDownload}>
                <DownloadIcon />
                Download PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2Icon />
                Delete Note
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {status === "conflict" && <ConflictBanner />}
      <div
        className="flex-1 cursor-text"
        onClick={(event) => {
          // The whole page is the note: clicking below the text continues it.
          if (!(event.target as Element).closest(".ProseMirror")) editor?.commands.focus("end");
        }}
      >
        <div className="mx-auto w-full max-w-2xl px-6 py-8 sm:px-10 sm:py-10">
          {editor ? <EditorContent editor={editor} /> : <NoteSkeleton />}
        </div>
      </div>
    </section>
  );
}

function FormatButtons({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  const isMac = useIsMac();
  const state = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor && {
        heading: editor.isActive("heading"),
        bold: editor.isActive("bold"),
        italic: editor.isActive("italic"),
        bulletList: editor.isActive("bulletList"),
        orderedList: editor.isActive("orderedList"),
        taskList: editor.isActive("taskList"),
      },
  });

  const run = (command: (editor: Editor) => void) => () => {
    if (editor) command(editor);
  };
  const groups = [
    [
      { name: "heading", label: "Heading", icon: HeadingIcon, keys: ["Mod", "Alt", "2"], run: run((e) => e.chain().focus().toggleHeading({ level: 2 }).run()) },
      { name: "bold", label: "Bold", icon: BoldIcon, keys: ["Mod", "B"], run: run((e) => e.chain().focus().toggleBold().run()) },
      { name: "italic", label: "Italic", icon: ItalicIcon, keys: ["Mod", "I"], run: run((e) => e.chain().focus().toggleItalic().run()) },
    ],
    [
      { name: "bulletList", label: "Bulleted List", icon: ListIcon, keys: ["Mod", "Shift", "8"], run: run((e) => e.chain().focus().toggleBulletList().run()) },
      { name: "orderedList", label: "Numbered List", icon: ListOrderedIcon, keys: ["Mod", "Shift", "7"], run: run((e) => e.chain().focus().toggleOrderedList().run()) },
      { name: "taskList", label: "Checklist", icon: ListTodoIcon, keys: ["Mod", "Shift", "9"], run: run((e) => e.chain().focus().toggleTaskList().run()) },
    ],
  ] as const;

  return groups.map((group, index) => (
    <div key={index} className="flex items-center gap-1">
      {index > 0 && <Separator orientation="vertical" className="mx-1.5 data-vertical:h-5 data-vertical:self-auto" />}
      {group.map((format) => (
        <Tooltip key={format.name}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={format.label}
              aria-pressed={state?.[format.name] ?? false}
              disabled={!editor || disabled}
              className="aria-pressed:bg-muted"
              onClick={format.run}
            >
              <format.icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {format.label} <Kbd>{shortcutLabel([...format.keys], isMac)}</Kbd>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  ));
}

const STATUS: Record<SaveStatus, { tone: SaveTone; label: string }> = {
  saved: { tone: "saved", label: "Saved" },
  saving: { tone: "saving", label: "Saving…" },
  offline: { tone: "warning", label: "Offline — changes kept on this device" },
  error: { tone: "error", label: "Couldn't save — changes kept on this device" },
  conflict: { tone: "error", label: "Not saved — changed elsewhere" },
};

function ConflictBanner() {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 sm:px-6 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <TriangleAlertIcon className="size-4 shrink-0" />
      <p className="flex-1">
        Editing is paused because this note was saved from another tab or window. Reload to get the
        latest version; anything unsaved here will be offered as a new note.
      </p>
      <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
        <RotateCwIcon data-icon="inline-start" />
        Reload
      </Button>
    </div>
  );
}

function NoteSkeleton() {
  return (
    <div aria-hidden className="space-y-3">
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}
