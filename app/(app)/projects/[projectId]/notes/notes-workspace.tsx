"use client";

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NotebookPenIcon, SquarePenIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { downloadBlob, safeFileName } from "@/lib/download";
import { DraftSaver, readBackup, type SaveStatus } from "@/lib/draft-saver";
import { newId } from "@/lib/id";
import { parseNoteDoc } from "@/lib/notes/schema";
import { noteText, noteTitle } from "@/lib/notes/text";
import { emptyNote, type NoteData } from "@/lib/notes/types";
import { defaultPaper } from "@/lib/paper";
import type { ShareSettings } from "@/lib/share/types";

import { ShareDialog } from "../share-dialog";
import { deleteNoteAction, restoreNoteAction } from "./actions";
import { NoteEditor } from "./note-editor";
import { NoteList } from "./note-list";

/** A note as this page knows it. */
export type NoteState = NoteData & {
  /** The latest document, once it's been edited here. `content` is what the page loaded. */
  doc?: ProseMirrorNode;
  /** Bumped when the content changes from outside the editor, so the editor starts over. */
  version: number;
};

/** What deleting a note left behind, for Undo. */
type Deletion = { ok: boolean; revision: number; unsaved: boolean };

const backupPrefix = (projectId: string) => `shotlist:note:${projectId}:`;

function newNote(doc?: ProseMirrorNode): NoteState {
  return {
    id: newId(),
    content: emptyNote(),
    doc,
    text: doc ? noteText(doc) : "",
    revision: 0,
    updatedAt: new Date().toISOString(),
    version: 0,
  };
}

export function NotesWorkspace({
  projectId,
  projectTitle,
  notes: loaded,
  shares: loadedShares,
}: {
  projectId: string;
  projectTitle: string;
  notes: NoteData[];
  /** Links to notes, by note ID. */
  shares: Record<string, ShareSettings>;
}) {
  const [notes, setNotes] = useState<NoteState[]>(() => loaded.map((note) => ({ ...note, version: 0 })));
  const [shares, setShares] = useState(loadedShares);
  const [statuses, setStatuses] = useState<Record<string, SaveStatus>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  // One per note, made on its first edit. They outlive the editor, which only shows one note.
  const savers = useRef(new Map<string, DraftSaver>());

  const sorted = useMemo(() => notes.toSorted((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)), [notes]);
  const requestedId = useSearchParams().get("note");
  const requested = sorted.find((note) => note.id === requestedId);
  const selected = requested ?? sorted[0];

  const saverFor = useCallback(
    (note: Pick<NoteState, "id" | "revision">) => {
      let saver = savers.current.get(note.id);
      if (!saver) {
        saver = new DraftSaver({
          url: `/api/projects/${projectId}/notes/${note.id}`,
          backupKey: backupPrefix(projectId) + note.id,
          revision: note.revision,
          onStatusChange: (status) => setStatuses((current) => ({ ...current, [note.id]: status })),
          storage: window.localStorage,
        });
        savers.current.set(note.id, saver);
      }
      return saver;
    },
    [projectId],
  );

  const changeNote = useCallback(
    (note: NoteState, doc: ProseMirrorNode) => {
      saverFor(note).change(() => doc.toJSON());
      const text = noteText(doc);
      const updatedAt = new Date().toISOString();
      setNotes((current) => current.map((item) => (item.id === note.id ? { ...item, doc, text, updatedAt } : item)));
    },
    [saverFor],
  );

  /** Adds a note, optionally with content to save, and opens it. */
  const addNote = useCallback(
    (doc?: ProseMirrorNode) => {
      const note = newNote(doc);
      setNotes((current) => [...current, note]);
      if (doc) saverFor(note).change(() => doc.toJSON());
      showNote(note.id);
      return note;
    },
    [saverFor],
  );

  // Bring back edits that never reached the server (crash, closed tab, lost connection).
  const restoreChecked = useRef(false);
  useEffect(() => {
    if (restoreChecked.current) return;
    restoreChecked.current = true;

    const restored = new Map<string, ProseMirrorNode>();
    const added: NoteState[] = [];
    for (const { key, noteId, baseRevision, doc } of readBackups(projectId)) {
      window.localStorage.removeItem(key);
      const note = loaded.find((item) => item.id === noteId);
      if (!note) {
        // A new note whose first save never arrived. Otherwise the note was deleted.
        if (baseRevision === 0) {
          const recovered = newNote(doc);
          saverFor(recovered).change(() => doc.toJSON());
          added.push(recovered);
        }
        continue;
      }
      if (baseRevision !== note.revision) {
        toast.warning(`Found unsaved changes from an older copy of “${noteTitle(noteText(doc)) || "a note"}”.`, {
          description: "The note was saved somewhere else since.",
          duration: Infinity,
          action: { label: "Restore as New Note", onClick: () => addNote(doc) },
        });
        continue;
      }
      if (!doc.eq(parseNoteDoc(note.content))) restored.set(noteId, doc);
    }
    if (restored.size === 0 && added.length === 0) return;

    for (const note of loaded) {
      const doc = restored.get(note.id);
      if (doc) saverFor(note).change(() => doc.toJSON());
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage can only be read once hydrated
    setNotes((current) => [
      ...current.map((note) => {
        const doc = restored.get(note.id);
        return doc ? { ...note, doc, text: noteText(doc), version: note.version + 1 } : note;
      }),
      ...added,
    ]);
    toast.success("Restored changes that hadn't been saved yet.");
  }, [projectId, loaded, saverFor, addNote]);

  useEffect(() => {
    const pending = () => [...savers.current.values()].filter((saver) => saver.hasUnsavedChanges);
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const unsaved = pending();
      if (unsaved.length === 0) return;
      unsaved.forEach((saver) => void saver.flush());
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Leaving the page saves what's left.
      pending().forEach((saver) => void saver.settle());
    };
  }, []);

  /** Waits for the note's saves to finish, then deletes it if the server has it. */
  const deleteOnServer = async (note: NoteState): Promise<Deletion> => {
    const saver = savers.current.get(note.id);
    savers.current.delete(note.id);
    await saver?.settle();
    const revision = saver?.currentRevision ?? note.revision;
    const unsaved = saver?.hasUnsavedChanges ?? false;
    // Edits that still couldn't be saved go with the note. Undo brings them back.
    saver?.discard();
    if (revision === 0) return { ok: true, revision, unsaved };
    try {
      await deleteNoteAction(projectId, note.id);
      return { ok: true, revision, unsaved };
    } catch {
      return { ok: false, revision, unsaved };
    }
  };

  const bringBack = (note: NoteState, { revision, unsaved }: Deletion) => {
    const restored = { ...note, revision, version: note.version + 1 };
    setNotes((current) => [...current.filter((item) => item.id !== note.id), restored]);
    const doc = note.doc;
    if (unsaved && doc) saverFor(restored).change(() => doc.toJSON());
  };

  const deleteNote = (note: NoteState) => {
    setNotes((current) => current.filter((item) => item.id !== note.id));
    const deletion = deleteOnServer(note);
    // Empty notes go quietly.
    if (!note.text) return;

    void deletion.then((result) => {
      if (result.ok) return;
      bringBack(note, result);
      toast.error("Couldn't delete the note. Try again.");
    });
    toast(`Deleted “${noteTitle(note.text)}”`, {
      action: {
        label: "Undo",
        onClick: async () => {
          const result = await deletion;
          if (!result.ok) return;
          try {
            if (result.revision > 0) await restoreNoteAction(projectId, note.id);
          } catch {
            toast.error("Couldn't bring the note back.");
            return;
          }
          bringBack(note, result);
          showNote(note.id);
        },
      },
    });
  };

  // As in most notes apps, a note left empty goes away.
  const select = (id: string | null) => {
    if (selected && selected.id !== id && !selected.text) deleteNote(selected);
    showNote(id);
  };

  /** A note can only be shared once the server has it. */
  const saveForSharing = async (note: NoteState) => {
    const saver = savers.current.get(note.id);
    await saver?.settle();
    return (saver?.currentRevision ?? note.revision) > 0;
  };

  const createNote = () => {
    if (selected && !selected.text) deleteNote(selected);
    setFocusId(addNote().id);
  };

  if (notes.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <EmptyState
          icon={NotebookPenIcon}
          title="Notes"
          description="Ideas, references, research, things to shoot. Jot them down here; the script and shot list can come later."
        >
          <Button onClick={createNote}>
            <SquarePenIcon data-icon="inline-start" />
            New Note
          </Button>
        </EmptyState>
      </div>
    );
  }

  // Small screens show the list or the open note, not both.
  return (
    <div className="flex flex-1">
      <NoteList
        notes={sorted}
        shares={shares}
        selectedId={selected?.id ?? null}
        onSelect={select}
        onCreate={createNote}
        onDownloadAll={() => void downloadNotesPdf(sorted, `${projectTitle} Notes`, projectTitle)}
        className={requested ? "max-md:hidden" : undefined}
      />
      {selected && (
        <NoteEditor
          key={`${selected.id}:${selected.version}`}
          note={selected}
          status={statuses[selected.id] ?? "saved"}
          autofocus={focusId === selected.id}
          onChange={changeNote}
          onDelete={() => deleteNote(selected)}
          onDownload={() => void downloadNotesPdf([selected], noteTitle(selected.text), projectTitle)}
          share={
            <ShareDialog
              projectId={projectId}
              target={{ kind: "note", noteId: selected.id }}
              share={shares[selected.id] ?? null}
              onShareChange={(share) => setShares((current) => ({ ...current, [selected.id]: share }))}
              prepare={() => saveForSharing(selected)}
              disabled={statuses[selected.id] === "conflict"}
            />
          }
          onBack={() => select(null)}
          className={requested ? undefined : "max-md:hidden"}
        />
      )}
    </div>
  );
}

/** Downloads the notes that have anything in them as one PDF, as last edited here. */
async function downloadNotesPdf(notes: NoteState[], title: string, projectTitle: string) {
  const docs = notes.filter((note) => note.text).map((note) => note.doc ?? parseNoteDoc(note.content));
  if (docs.length === 0) return;

  const toastId = toast.loading("Creating PDF…");
  try {
    const { renderNotesPdf } = await import("@/lib/notes/pdf");
    const blob = await renderNotesPdf(docs, { paper: defaultPaper(), title, projectTitle });
    downloadBlob(blob, `${safeFileName(title, "Notes")}.pdf`);
    toast.dismiss(toastId);
  } catch (cause) {
    console.error(cause);
    toast.error("Couldn't create the PDF. Check your connection and try again.", { id: toastId });
  }
}

/** The open note lives in the URL, so it survives reloads. */
function showNote(id: string | null) {
  window.history.replaceState(null, "", id ? `?note=${encodeURIComponent(id)}` : window.location.pathname);
}

/** This project's backups of unsaved notes. Unreadable ones are dropped. */
function readBackups(projectId: string) {
  const prefix = backupPrefix(projectId);
  const storage = window.localStorage;
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
    (key): key is string => key?.startsWith(prefix) ?? false,
  );

  return keys.flatMap((key) => {
    const backup = readBackup(key, storage);
    try {
      if (backup) {
        const doc = parseNoteDoc(backup.draft);
        return [{ key, noteId: key.slice(prefix.length), baseRevision: backup.baseRevision, doc }];
      }
    } catch {
      // Not a note this version can read.
    }
    storage.removeItem(key);
    return [];
  });
}
