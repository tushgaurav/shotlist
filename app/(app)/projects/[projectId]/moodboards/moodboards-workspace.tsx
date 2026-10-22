"use client";

import { cn } from "cn";
import { ImagesIcon, PlusIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { downloadBlob, safeFileName } from "@/lib/download";
import { IMAGE_ERRORS } from "@/lib/images/upload";
import { paletteFromImage } from "@/lib/moodboards/palette";
import {
  BOARD_NAME_MAX_LENGTH,
  isWideByDefault,
  paletteContent,
  type BoardItem,
  type BoardRecord,
  type ProjectImage,
  type MoodboardData,
} from "@/lib/moodboards/types";
import { parseLink } from "@/lib/moodboards/video-links";
import { defaultPaper } from "@/lib/paper";
import { assetUrl } from "@/lib/shots/images";

import { useIgnoreStrayFileDrops } from "../(workspace)/shots/project-shots";
import { createShotFromImageAction, setCoverFromBoardAction } from "./actions";
import { BoardGrid } from "./board-grid";
import { BoardHeader } from "./board-header";
import { itemName } from "./board-items";
import { BoardList } from "./board-list";
import { BoardViewer, isViewable } from "./board-viewer";
import { BoardContext, type BoardActions, type Dragged } from "./context";
import { LinkDialog } from "./link-dialog";
import { PaletteDialog } from "./palette-dialog";
import { lookupLink, useProjectBoards } from "./project-boards";
import { ProjectImagesDialog } from "./project-images-dialog";

const ITEM_DRAG_TYPE = "application/x-shotlist-moodboard-item";
const BOARD_DRAG_TYPE = "application/x-shotlist-moodboard";

type Props = {
  projectId: string;
  projectTitle: string;
  data: MoodboardData;
  images: ProjectImage[];
  imagesEnabled: boolean;
};

export function MoodboardsWorkspace({ projectId, projectTitle, data, images, imagesEnabled }: Props) {
  const { store, uploader } = useProjectBoards(projectId, data);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const uploads = useSyncExternalStore(uploader.subscribe, uploader.getSnapshot, uploader.getSnapshot);
  const router = useRouter();
  useIgnoreStrayFileDrops();

  // The open board lives in the URL, so it survives reloads.
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState(() => searchParams.get("board"));
  const requested = state.boards.find((board) => board.id === selectedId) ?? null;
  const selected = requested ?? state.boards.find((board) => !board.archived) ?? state.boards[0] ?? null;

  const dragged = useRef<Dragged | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [paletteTarget, setPaletteTarget] = useState<{ boardId: string; itemId: string | null } | null>(null);
  const [linkBoardId, setLinkBoardId] = useState<string | null>(null);
  const [imagesBoardId, setImagesBoardId] = useState<string | null>(null);
  const [nameFocus, setNameFocus] = useState<{ boardId: string; request: number } | null>(null);

  // A dialog left open shouldn't greet you when you come back to the page.
  useLayoutEffect(
    () => () => {
      setViewingId(null);
      setPaletteTarget(null);
      setLinkBoardId(null);
      setImagesBoardId(null);
    },
    [],
  );

  const showBoard = useCallback((id: string | null) => {
    setSelectedId(id);
    setNameFocus(null);
    window.history.replaceState(null, "", id ? `?board=${encodeURIComponent(id)}` : window.location.pathname);
  }, []);

  const actions = useMemo<BoardActions>(() => {
    // Renders the change before returning, so the new card can be focused.
    const now = <T,>(change: () => T): T => {
      let result!: T;
      flushSync(() => {
        result = change();
      });
      return result;
    };
    const itemById = (id: string) => store.getSnapshot().items.find((item) => item.id === id);
    const boardName = (id: string) => store.getSnapshot().boards.find((board) => board.id === id)?.name ?? "";
    const requireImages = () => {
      if (!imagesEnabled) toast.error(IMAGE_ERRORS.unavailable, { id: "image-upload-error" });
      return imagesEnabled;
    };
    const focusItem: BoardActions["focusItem"] = (itemId, field) => {
      const card = document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(itemId)}"]`);
      if (!card) return;
      const selector = field === "caption" ? "[data-caption]" : field === "text" ? "[data-text]" : "[data-focus-target]";
      const target = card.querySelector<HTMLElement>(selector);
      target?.focus();
      if (target instanceof HTMLTextAreaElement) target.setSelectionRange(target.value.length, target.value.length);
      card.scrollIntoView({ block: "nearest" });
    };
    const addLink = async (boardId: string, url: URL) => {
      const content = await lookupLink(url);
      store.addItem(boardId, {
        kind: "video_link",
        wide: false,
        assetId: null,
        caption: null,
        content,
        width: null,
        height: null,
      });
    };

    return {
      store,
      uploader,
      imagesEnabled,
      requireImages,
      focusItem,
      uploadImages: (boardId, files, beforeId = null) => {
        if (requireImages()) void uploader.add(boardId, files, beforeId);
      },
      addText: (boardId, style) => {
        const id = now(() =>
          store.addItem(boardId, {
            kind: "text",
            wide: isWideByDefault(style),
            assetId: null,
            caption: null,
            content: { text: "", style, align: "start" },
            width: null,
            height: null,
          }),
        );
        // An empty board's menu is gone by now, so it can't hand focus over when it closes.
        if (id) focusItem(id, "text");
        return id;
      },
      editPalette: (boardId, itemId) => setPaletteTarget({ boardId, itemId: itemId ?? null }),
      addLink: setLinkBoardId,
      pasteLink: addLink,
      addFromProject: setImagesBoardId,
      view: setViewingId,
      duplicate: (itemId) => {
        const id = now(() => store.duplicateItem(itemId));
        if (id) focusItem(id);
      },
      remove: (itemId, { quiet = false } = {}) => {
        const item = store.removeItem(itemId);
        if (!item || quiet) return;
        toast(`Deleted ${itemName(item)}`, {
          action: { label: "Undo", onClick: () => store.restoreItem(item) },
        });
      },
      moveTo: (itemId, boardId) => {
        store.moveItem(itemId, boardId, null);
        toast(`Moved to “${boardName(boardId)}”`, {
          action: { label: "Show", onClick: () => showBoard(boardId) },
        });
      },
      nudge: (itemId, direction) => {
        now(() => store.nudgeItem(itemId, direction));
        focusItem(itemId);
      },
      extractPalette: async (itemId) => {
        const item = itemById(itemId);
        if (!item?.assetId) return;
        try {
          const colors = await paletteFromImage(uploader.previewFor(item.assetId) ?? assetUrl(item.assetId, "thumb"));
          if (colors.length === 0) throw new Error("No colors found");
          const siblings = store.itemsIn(item.boardId);
          const next = siblings[siblings.findIndex((i) => i.id === itemId) + 1];
          store.addItem(
            item.boardId,
            { kind: "palette", wide: false, assetId: null, caption: null, content: { colors }, width: null, height: null },
            { beforeId: next?.id ?? null },
          );
        } catch (cause) {
          console.error(cause);
          toast.error("Couldn't read the image's colors.", {
            description: "The storage bucket has to allow GET requests from this site (its CORS rule).",
          });
        }
      },
      useAsCover: async (itemId) => {
        const assetId = itemById(itemId)?.assetId;
        if (!assetId) return;
        try {
          await setCoverFromBoardAction(projectId, assetId);
          toast.success("Header image updated");
        } catch {
          toast.error("Couldn't set the header image. Try again.");
        }
      },
      newShot: async (itemId) => {
        const item = itemById(itemId);
        if (!item?.assetId) return;
        try {
          const result = await createShotFromImageAction(projectId, item.assetId, item.caption);
          if (!result.ok) throw new Error(result.error);
          toast.success("Added a standalone shot", {
            action: { label: "Open Shot List", onClick: () => router.push(`/projects/${projectId}/shots`) },
          });
        } catch {
          toast.error("Couldn't make the shot. Try again.");
        }
      },
      download: async (itemId) => {
        const item = itemById(itemId);
        if (!item?.assetId) return;
        const url = assetUrl(item.assetId, "full");
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Download failed (${response.status})`);
          const blob = await response.blob();
          const name = safeFileName(item.caption ?? boardName(item.boardId), "Image");
          downloadBlob(blob, `${name}.${blob.type === "image/webp" ? "webp" : "jpg"}`);
        } catch {
          // The bucket may not allow reading it from here; the browser can still open it.
          window.open(url, "_blank", "noopener");
        }
      },
      dragStart: (event, itemId) => {
        event.dataTransfer.setData(ITEM_DRAG_TYPE, itemId);
        event.dataTransfer.effectAllowed = "move";
        const card = event.currentTarget.closest("[data-item-id]");
        if (card) event.dataTransfer.setDragImage(card, 24, 24);
        dragged.current = { kind: "item", id: itemId };
        setDraggingId(itemId);
      },
      dragBoardStart: (event, boardId) => {
        event.dataTransfer.setData(BOARD_DRAG_TYPE, boardId);
        event.dataTransfer.effectAllowed = "move";
        dragged.current = { kind: "board", id: boardId };
      },
      getDragged: () => dragged.current,
      dragEnd: () => {
        dragged.current = null;
        setDraggingId(null);
      },
    };
  }, [store, uploader, imagesEnabled, projectId, router, showBoard]);

  // Paste images or a link anywhere on the open board.
  const selectedBoardId = selected?.id ?? null;
  useEffect(() => {
    if (!selectedBoardId) return;
    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || !event.clipboardData) return;
      const target = event.target instanceof Element ? event.target : null;
      // Dialogs (palette, link) and other fields keep their own pastes.
      if (target?.closest("[role=dialog]")) return;
      const editing = target?.closest("input, textarea, [contenteditable=true]");
      const files = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"));
      if (files.length > 0 && !(editing && event.clipboardData.types.includes("text/plain"))) {
        event.preventDefault();
        actions.uploadImages(selectedBoardId, files);
        return;
      }
      if (editing) return;
      const url = parseLink(event.clipboardData.getData("text/plain"));
      if (!url) return;
      event.preventDefault();
      void actions.pasteLink(selectedBoardId, url);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [selectedBoardId, actions]);

  const boardItems = useMemo(
    () => state.items.filter((item) => item.boardId === selectedBoardId),
    [state.items, selectedBoardId],
  );
  const otherBoards = useMemo(
    () => state.boards.filter((board) => board.id !== selectedBoardId).map(({ id, name }) => ({ id, name })),
    [state.boards, selectedBoardId],
  );

  const createBoard = () => {
    const id = store.addBoard("Untitled Board");
    showBoard(id);
    setNameFocus((current) => ({ boardId: id, request: (current?.request ?? 0) + 1 }));
  };

  if (state.boards.length === 0) {
    return (
      <BoardContext value={actions}>
        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
          <EmptyState
            icon={ImagesIcon}
            title="Mood Boards"
            description="Gather the look of the project: reference images, color palettes, notes and clips. Make a board for each idea, like Locations or Wardrobe."
          >
            <Button onClick={createBoard}>
              <PlusIcon data-icon="inline-start" />
              New Board
            </Button>
          </EmptyState>
        </div>
      </BoardContext>
    );
  }

  const viewing = viewingId ? (state.items.find((item) => item.id === viewingId) ?? null) : null;
  const paletteItem = paletteTarget?.itemId ? state.items.find((item) => item.id === paletteTarget.itemId) : null;
  const palette = paletteItem ? paletteContent(paletteItem) : null;

  return (
    <BoardContext value={actions}>
      <div className="flex flex-1">
        {/* Small screens show the list or the open board, not both. */}
        <BoardList
          boards={state.boards}
          items={state.items}
          selectedId={selected?.id ?? null}
          onSelect={showBoard}
          onCreate={createBoard}
          onMove={(id, beforeId) => store.moveBoard(id, beforeId)}
          className={requested ? "max-md:hidden" : undefined}
        />
        {selected && (
          <section
            aria-label={selected.name}
            className={cn("flex min-w-0 flex-1 flex-col", !requested && "max-md:hidden")}
          >
            <BoardHeader
              board={selected}
              imageCount={boardItems.filter((item) => item.kind === "image").length}
              itemCount={boardItems.length}
              status={state.status}
              nameFocusRequest={nameFocus?.boardId === selected.id ? nameFocus.request : 0}
              onRename={(name) => store.updateBoard(selected.id, { name })}
              onColumnsChange={(columns) => store.updateBoard(selected.id, { columns })}
              onDuplicate={() => {
                const name = `${selected.name} (Copy)`.slice(0, BOARD_NAME_MAX_LENGTH);
                const id = store.duplicateBoard(selected.id, name);
                if (id) showBoard(id);
              }}
              onArchive={(archived) => {
                store.updateBoard(selected.id, { archived });
                toast(`${archived ? "Archived" : "Unarchived"} “${selected.name}”`, {
                  action: { label: "Undo", onClick: () => store.updateBoard(selected.id, { archived: !archived }) },
                });
              }}
              onDelete={() => {
                const removed = store.removeBoard(selected.id);
                if (!removed) return;
                toast(`Deleted “${selected.name}”`, {
                  action: {
                    label: "Undo",
                    onClick: () => {
                      store.restoreBoard(removed);
                      showBoard(removed.board.id);
                    },
                  },
                });
              }}
              onDownloadPdf={() => void downloadBoardPdf(selected, boardItems, projectTitle)}
              onBack={() => showBoard(null)}
            />
            <BoardGrid
              key={selected.id}
              board={selected}
              items={boardItems}
              uploads={uploads}
              otherBoards={otherBoards}
              draggingId={draggingId}
            />
          </section>
        )}
      </div>

      <BoardViewer
        item={viewing}
        items={viewing ? state.items.filter((item) => item.boardId === viewing.boardId && isViewable(item)) : []}
        uploader={uploader}
        onNavigate={setViewingId}
        onDownload={actions.download}
        onClose={() => setViewingId(null)}
      />
      <PaletteDialog
        palette={paletteTarget ? (palette ? { colors: palette.colors, name: paletteItem?.caption ?? "" } : "new") : null}
        onSave={({ colors, name }) => {
          if (!paletteTarget) return;
          const caption = name || null;
          if (paletteItem) store.updateItem(paletteItem.id, { content: { colors }, caption });
          else
            store.addItem(paletteTarget.boardId, {
              kind: "palette",
              wide: false,
              assetId: null,
              caption,
              content: { colors },
              width: null,
              height: null,
            });
          setPaletteTarget(null);
        }}
        onClose={() => setPaletteTarget(null)}
      />
      <LinkDialog
        open={linkBoardId !== null}
        onAdd={async (url) => {
          if (linkBoardId) await actions.pasteLink(linkBoardId, url);
          setLinkBoardId(null);
        }}
        onClose={() => setLinkBoardId(null)}
      />
      <ProjectImagesDialog
        open={imagesBoardId !== null}
        images={images}
        onBoard={new Set(state.items.filter((item) => item.boardId === imagesBoardId).map((item) => item.assetId!))}
        onAdd={(picked) => {
          if (imagesBoardId) {
            for (const image of picked) {
              store.addItem(imagesBoardId, {
                kind: "image",
                wide: false,
                assetId: image.id,
                caption: null,
                content: null,
                width: image.width,
                height: image.height,
              });
            }
          }
          setImagesBoardId(null);
        }}
        onClose={() => setImagesBoardId(null)}
      />
    </BoardContext>
  );
}

/** Downloads the board as a PDF, as it is here (unsaved edits included). */
async function downloadBoardPdf(board: BoardRecord, items: BoardItem[], projectTitle: string) {
  const toastId = toast.loading("Creating PDF…");
  try {
    const { renderBoardPdf } = await import("@/lib/moodboards/pdf");
    const { blob, missing } = await renderBoardPdf(board, items, { paper: defaultPaper(), projectTitle });
    downloadBlob(blob, `${safeFileName(board.name, "Mood Board")}.pdf`);
    if (missing === 0) toast.dismiss(toastId);
    else
      toast.warning(`${missing === 1 ? "An image" : `${missing} images`} couldn't be added to the PDF.`, {
        id: toastId,
        description: "The storage bucket has to allow GET requests from this site (its CORS rule).",
      });
  } catch (cause) {
    console.error(cause);
    toast.error("Couldn't create the PDF. Check your connection and try again.", { id: toastId });
  }
}
