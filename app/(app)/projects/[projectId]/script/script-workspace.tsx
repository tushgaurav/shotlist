"use client";

import type { Content } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { RotateCwIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadText, safeFileName } from "@/lib/download";
import { backupKey, DraftSaver, readBackup, type SaveStatus } from "@/lib/screenplay/draft-saver";
import { screenplayEditorExtensions } from "@/lib/screenplay/editor/extensions";
import { toFountain } from "@/lib/screenplay/fountain";
import type { ScreenplayDocJSON, TitlePage } from "@/lib/screenplay/types";
import type { ShotListData } from "@/lib/shots/types";
import { useLocalStorage, writeLocalStorage } from "@/lib/use-local-storage";
import { useMinWidth } from "@/lib/use-min-width";

import { useProjectShots } from "../shots/project-shots";
import { SceneSidebar } from "./scene-sidebar";
import { ScriptToolbar } from "./script-toolbar";
import { ShotPanel } from "./shot-panel";

import "./screenplay.css";

const SHOT_PANEL_KEY = "shotlist:script-shot-panel";

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
};

export function ScriptWorkspace({ script, projectId, projectTitle, shots, imagesEnabled }: ScriptWorkspaceProps) {
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
    onUpdate: ({ editor }) => {
      const doc = editor.state.doc;
      saver.change(() => doc.toJSON());
    },
  });

  const exportFountain = (doc: ScreenplayDocJSON) => {
    const fileName = safeFileName(projectTitle, "Script");
    downloadText(toFountain(doc, exportTitlePage(titlePage, projectTitle)), `${fileName}.fountain`);
  };

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
          onExport={() => editor && exportFountain(editor.getJSON() as ScreenplayDocJSON)}
          shotPanelOpen={shotPanel.open}
          onToggleShotPanel={shotPanel.toggle}
        />
        {status === "conflict" && <ConflictBanner />}
      </div>
      <div className="flex flex-1">
        <SceneSidebar key={`scenes-${editorKey}`} editor={editor} shots={projectShots.store} />
        <div className="min-w-0 flex-1 bg-muted/60 px-3 py-6 sm:px-8 sm:py-10">
          <div className="screenplay-page">
            {editor ? <EditorContent editor={editor} /> : <PageSkeleton />}
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
          className={shotPanel.className}
        />
      </div>
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

function exportTitlePage(titlePage: TitlePage, projectTitle: string): TitlePage {
  return {
    ...titlePage,
    title: titlePage.title || projectTitle,
    credit: titlePage.credit || (titlePage.author ? "Written by" : undefined),
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
