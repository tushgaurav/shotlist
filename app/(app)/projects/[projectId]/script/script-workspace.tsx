"use client";

import type { Content } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { RotateCwIcon, TriangleAlertIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadText, safeFileName } from "@/lib/download";
import { backupKey, DraftSaver, readBackup, type SaveStatus } from "@/lib/screenplay/draft-saver";
import { isBlankDoc } from "@/lib/screenplay/editor/ai-ranges";
import { committedDoc, getAiSuggestion, isAiSuggestionTransaction } from "@/lib/screenplay/editor/ai-suggestion";
import { screenplayEditorExtensions } from "@/lib/screenplay/editor/extensions";
import { toFountain } from "@/lib/screenplay/fountain";
import type { ScreenplayDocJSON, TitlePage } from "@/lib/screenplay/types";
import type { ShotListData } from "@/lib/shots/types";
import { useLocalStorage, writeLocalStorage } from "@/lib/use-local-storage";
import { useMinWidth } from "@/lib/use-min-width";

import { useProjectShots } from "../shots/project-shots";
import { AssistantPanel } from "./ai/assistant-panel";
import { Composer, composerSession, type ComposerSession } from "./ai/composer";
import { DraftDialog } from "./ai/draft-dialog";
import { EmptyScriptCard } from "./ai/empty-script-card";
import { REVISE_INPUT_ID, SuggestionBar } from "./ai/suggestion-bar";
import { useAiModel, useInlineSuggestions } from "./ai/use-ai-model";
import { useAiWriter } from "./ai/use-ai-writer";
import { useGhostText } from "./ai/use-ghost-text";
import { SceneSidebar } from "./scene-sidebar";
import { ScriptToolbar } from "./script-toolbar";
import { ShotPanel } from "./shot-panel";

import "./screenplay.css";

const SHOT_PANEL_KEY = "shotlist:script-shot-panel";
const ASSISTANT_KEY = "shotlist:script-assistant";

export type ScriptWorkspaceProps = {
  script: {
    id: string;
    draft: ScreenplayDocJSON;
    draftRevision: number;
    titlePage: TitlePage;
  };
  projectId: string;
  projectTitle: string;
  shots: ShotListData;
  imagesEnabled: boolean;
  /** Whether OPENROUTER_API_KEY is set, and which project details the AI can use. */
  ai: { enabled: boolean; details: string[]; targetRuntimeMinutes: number | null };
};

export function ScriptWorkspace({ script, projectId, projectTitle, shots, imagesEnabled, ai }: ScriptWorkspaceProps) {
  const projectShots = useProjectShots(projectId, shots);
  const [workspace, setWorkspace] = useState<HTMLDivElement | null>(null);
  const shotPanel = useShotPanelPreference(workspace);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [titlePage, setTitlePage] = useState(script.titlePage);
  const [saver] = useState(
    () =>
      new DraftSaver({
        scriptId: script.id,
        revision: script.draftRevision,
        onStatusChange: setStatus,
        storage: typeof window === "undefined" ? null : window.localStorage,
      }),
  );

  const [extensions] = useState(screenplayEditorExtensions);
  const editor = useEditor({
    extensions,
    content: script.draft,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { "aria-label": "Screenplay", spellcheck: "true" },
    },
    onUpdate: ({ editor, transaction }) => {
      // Lines the AI is still suggesting aren't part of the draft until they're accepted.
      if (isAiSuggestionTransaction(transaction)) return;
      const state = editor.state;
      saver.change(() => committedDoc(state).toJSON());
    },
  });

  // Bring back edits that never reached the server (crash, closed tab, lost connection).
  const restoreChecked = useRef(false);
  useEffect(() => {
    if (!editor || restoreChecked.current) return;
    restoreChecked.current = true;

    const backup = readBackup(script.id, window.localStorage);
    if (!backup) return;
    window.localStorage.removeItem(backupKey(script.id));

    if (backup.baseRevision !== script.draftRevision) {
      toast.warning("Found unsaved changes from an older copy of this script.", {
        description: "The script was saved somewhere else since. Download them to compare.",
        duration: Infinity,
        action: {
          label: "Download",
          onClick: () => {
            const fileName = safeFileName(projectTitle, "Script");
            downloadText(toFountain(backup.draft as ScreenplayDocJSON), `${fileName} (unsaved).fountain`);
          },
        },
      });
      return;
    }
    if (JSON.stringify(backup.draft) === JSON.stringify(script.draft)) return;

    editor.commands.setContent(backup.draft as Content, { emitUpdate: true });
    toast.success("Restored changes that hadn't been saved yet.");
  }, [editor, script, projectTitle]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!saver.hasUnsavedChanges) return;
      void saver.flush();
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      void saver.flush();
    };
  }, [saver]);

  useEffect(() => {
    if (status === "conflict") editor?.setEditable(false);
  }, [editor, status]);

  const [model] = useAiModel();
  const writer = useAiWriter(editor, projectId, model);
  const [inlineSuggestions] = useInlineSuggestions();
  useGhostText(editor, projectId, ai.enabled && inlineSuggestions && status !== "conflict");
  const [composer, setComposer] = useState<ComposerSession | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);

  const openComposer = useCallback(() => {
    if (!editor || status === "conflict" || writer.busy) return;
    if (!ai.enabled) {
      toast("AI writing isn't set up.", {
        description: "Add OPENROUTER_API_KEY to the server's environment to turn it on.",
      });
      return;
    }
    if (getAiSuggestion(editor.state)?.status === "review") {
      document.getElementById(REVISE_INPUT_ID)?.focus();
      return;
    }
    setComposer(composerSession(editor.state));
  }, [editor, status, writer.busy, ai.enabled]);

  const assistantOpen = useLocalStorage(ASSISTANT_KEY) === "open" && ai.enabled;
  const roomBesidePage = useMinWidth(workspace, 80);
  const assistantDocked = assistantOpen && roomBesidePage;
  const setAssistantOpen = useCallback((open: boolean) => writeLocalStorage(ASSISTANT_KEY, open ? "open" : null), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        openComposer();
      } else if (key === "j" && ai.enabled) {
        event.preventDefault();
        setAssistantOpen(!assistantOpen);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openComposer, ai.enabled, assistantOpen, setAssistantOpen]);

  // The assistant and the shots share the space beside the page.
  const toggleShotPanel = () => {
    if (!assistantDocked) return shotPanel.toggle();
    setAssistantOpen(false);
    if (!shotPanel.open) shotPanel.toggle();
  };

  // The teleprompter reads the saved draft. The tab opens during the click, before saving,
  // because pop-up blockers refuse tabs opened later.
  const openTeleprompter = () => {
    const url = `/projects/${projectId}/teleprompter`;
    if (!saver.hasUnsavedChanges) {
      window.open(url, "_blank");
      return;
    }
    const tab = window.open("", "_blank");
    void saver.settle().then(() => {
      if (tab) tab.location.href = url;
      if (saver.hasUnsavedChanges) {
        toast.warning("The teleprompter shows the last saved version.", {
          description: "Some changes haven't saved yet. Reload the teleprompter once they have.",
        });
      }
    });
  };

  // useEditorState keeps its first snapshot when the editor goes from null to ready, so
  // components that read editor state remount once it exists.
  const editorKey = editor ? "ready" : "loading";

  return (
    <div ref={setWorkspace} className="flex flex-1 flex-col">
      <div className="sticky top-12 z-30">
        <ScriptToolbar
          key={editorKey}
          editor={editor}
          status={status}
          scriptId={script.id}
          projectTitle={projectTitle}
          titlePage={titlePage}
          onTitlePageSaved={setTitlePage}
          shotPanelOpen={shotPanel.open && !assistantDocked}
          onToggleShotPanel={toggleShotPanel}
          onOpenTeleprompter={openTeleprompter}
          ai={{
            enabled: ai.enabled,
            busy: writer.busy,
            onWrite: openComposer,
            onDraft: () => setDraftOpen(true),
            assistantOpen,
            onToggleAssistant: () => setAssistantOpen(!assistantOpen),
          }}
        />
        {status === "conflict" && <ConflictBanner />}
      </div>
      <div className="flex flex-1">
        <SceneSidebar key={`scenes-${editorKey}`} editor={editor} shots={projectShots.store} />
        <div className="min-w-0 flex-1 bg-muted/60 px-3 py-6 sm:px-8 sm:py-10">
          <div className="screenplay-page relative">
            {editor ? <EditorContent editor={editor} /> : <PageSkeleton />}
            {editor && ai.enabled && status !== "conflict" && (
              <EmptyScriptCard editor={editor} onDraft={() => setDraftOpen(true)} onCompose={openComposer} />
            )}
          </div>
        </div>
        <ShotPanel
          key={`shots-${editorKey}`}
          editor={editor}
          projectId={projectId}
          shots={projectShots}
          imagesEnabled={imagesEnabled}
          saver={saver}
          onClose={shotPanel.toggle}
          className={assistantDocked ? "hidden" : shotPanel.className}
        />
        {editor && assistantOpen && (
          <AssistantPanel
            docked={roomBesidePage}
            editor={editor}
            writer={writer}
            projectId={projectId}
            details={ai.details}
            onClose={() => setAssistantOpen(false)}
          />
        )}
      </div>
      {editor && ai.enabled && (
        <>
          <SuggestionBar editor={editor} writer={writer} />
          <Composer
            editor={editor}
            writer={writer}
            session={composer}
            onClose={() => setComposer(null)}
            onDraft={() => setDraftOpen(true)}
            projectId={projectId}
            details={ai.details}
          />
          <DraftDialog
            open={draftOpen}
            onOpenChange={setDraftOpen}
            writer={writer}
            projectId={projectId}
            details={ai.details}
            targetRuntimeMinutes={ai.targetRuntimeMinutes}
            appending={!isBlankDoc(editor.state.doc)}
          />
        </>
      )}
    </div>
  );
}

/**
 * The shots panel only fits beside the page when there's room, which depends on the
 * app sidebar as well as the screen. Until it's toggled it opens in the widest
 * workspaces; container queries decide that, so the server renders it right.
 */
function useShotPanelPreference(workspace: HTMLElement | null) {
  const preference = useLocalStorage(SHOT_PANEL_KEY);
  const widest = useMinWidth(workspace, 96);
  const open = preference === "open" || (preference === null && widest);
  return {
    open,
    toggle: () => writeLocalStorage(SHOT_PANEL_KEY, open ? "closed" : "open"),
    className:
      preference === "closed" ? "hidden" : preference === "open" ? "hidden @7xl:flex" : "hidden @min-[96rem]:flex",
  };
}

function ConflictBanner() {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 sm:px-6 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <TriangleAlertIcon className="size-4 shrink-0" />
      <p className="flex-1">
        Editing is paused because this script was saved from another tab or window. Reload to get
        the latest version; anything unsaved here will be offered as a download.
      </p>
      <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
        <RotateCwIcon data-icon="inline-start" />
        Reload
      </Button>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div aria-hidden className="space-y-4">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="ml-[2.2in] h-4 w-24" />
      <Skeleton className="ml-[1in] h-4 w-[3in]" />
    </div>
  );
}
