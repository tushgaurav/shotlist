"use client";

import { cn } from "cn";
import { MessageSquareIcon, MessageSquarePlusIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { SidebarWordmark } from "@/app/(app)/sidebar-wordmark";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { findQuote, QUOTE_MAX_LENGTH, quoteAt, trimSpan, type CommentQuote, type TextSpan } from "@/lib/share/quotes";
import { blockAt, indexText, offsetAt, offsetAtPoint, rangeOf, type TextIndex } from "@/lib/share/text-index";
import type { SharedComment, ShareKind } from "@/lib/share/types";
import { useMediaQuery } from "@/lib/use-media-query";

import { addCommentAction, deleteCommentAction, setCommentResolvedAction } from "./actions";
import { CommentsPanel, type NewComment, type Thread } from "./comments-panel";

/** A passage picked to comment on, before the comment is posted. */
export type Draft = { quote: CommentQuote; span: TextSpan };

type Selection = { span: TextSpan; top: number; left: number };

type Props = {
  token: string;
  kind: ShareKind;
  title: string;
  projectTitle: string;
  owner: { name: string; editHref: string } | null;
  enabled: boolean;
  allowComments: boolean;
  comments: SharedComment[];
  /** The document, rendered on the server. */
  children: React.ReactNode;
};

const HIGHLIGHTS = ["share-comment", "share-comment-active", "share-comment-draft"] as const;

export function ShareView({
  token,
  kind,
  title,
  projectTitle,
  owner,
  enabled,
  allowComments,
  comments: loaded,
  children,
}: Props) {
  const [comments, setComments] = useState(loaded);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [focusComposer, setFocusComposer] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);

  // Wide screens keep the comments beside the document; narrow ones open them in a sheet.
  const wide = useMediaQuery("(min-width: 64rem)");
  const hydrated = useHydrated();
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const scrollAfterSheet = useRef<TextSpan | null>(null);

  const page = useRef<HTMLDivElement | null>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [index, setIndex] = useState<TextIndex | null>(null);
  const attachPage = useCallback((node: HTMLDivElement | null) => {
    page.current = node;
    const found = node?.querySelector<HTMLElement>("[data-share-body]") ?? null;
    setBody(found);
    setIndex(found ? indexText(found) : null);
  }, []);

  const threads = useMemo(() => buildThreads(comments, index, body), [comments, index, body]);
  const openCount = threads.filter((thread) => !thread.comment.resolvedAt).length;
  const commentsVisible = allowComments || comments.length > 0;

  useEffect(() => {
    if (!index || !("highlights" in CSS)) return;
    const highlight = (spans: (TextSpan | null)[]) =>
      new Highlight(...spans.flatMap((span) => (span && rangeOf(index, span)) || []));

    CSS.highlights.set("share-comment", highlight(threads.filter((t) => !t.comment.resolvedAt).map((t) => t.span)));
    CSS.highlights.set("share-comment-active", highlight(threads.filter((t) => t.comment.id === activeId).map((t) => t.span)));
    CSS.highlights.set("share-comment-draft", highlight([draft?.span ?? null]));
    return () => HIGHLIGHTS.forEach((name) => CSS.highlights.delete(name));
  }, [index, threads, activeId, draft]);

  // A "Comment" button follows whatever's selected in the document.
  useEffect(() => {
    if (!index || !body || !allowComments) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSelection(readSelection(index, body, page.current)));
    };
    document.addEventListener("selectionchange", update);
    // Text may have been selected before the page was ready.
    update();
    return () => {
      document.removeEventListener("selectionchange", update);
      cancelAnimationFrame(frame);
    };
  }, [index, body, allowComments]);

  const openPanel = () => (wide ? setPanelOpen(true) : setSheetOpen(true));

  const startComment = () => {
    if (!selection || !index) return;
    if (selection.span.end - selection.span.start > QUOTE_MAX_LENGTH) {
      toast("Select a shorter passage to comment on.");
      return;
    }
    setDraft({ quote: quoteAt(index.text, selection.span), span: selection.span });
    setActiveId(null);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    openPanel();
    setFocusComposer((count) => count + 1);
  };

  const startGeneralComment = () => {
    setDraft(null);
    openPanel();
    setFocusComposer((count) => count + 1);
  };

  /** Clicking a highlighted passage opens its thread. */
  const onPageClick = (event: React.MouseEvent) => {
    if (!index || !window.getSelection()?.isCollapsed) return;
    if ((event.target as Element).closest("a, button, input")) return;
    const offset = offsetAtPoint(index, event.clientX, event.clientY);
    const hit =
      offset === null
        ? undefined
        : threads
            .filter(({ comment, span }) => !comment.resolvedAt && span && span.start <= offset && offset < span.end)
            .sort((a, b) => spanLength(a.span) - spanLength(b.span))[0];
    setActiveId(hit?.comment.id ?? null);
    if (hit) openPanel();
  };

  /** Picking a thread in the panel shows its passage. */
  const activate = (thread: Thread) => {
    setActiveId(thread.comment.id);
    if (!thread.span) return;
    if (wide) {
      scrollToSpan(index, thread.span);
    } else {
      // The sheet locks scrolling until it's gone.
      scrollAfterSheet.current = thread.span;
      setSheetOpen(false);
    }
  };

  const post = async ({ body: text, quote, parentId, authorName }: NewComment) => {
    try {
      const result = await addCommentAction(token, { body: text, quote, parentId, authorName });
      if ("error" in result) {
        toast.error(result.error);
        return false;
      }
      setComments((current) => [...current, result.comment]);
      if (!parentId) {
        setDraft(null);
        setActiveId(result.comment.id);
      }
      return true;
    } catch {
      toast.error("Couldn't post the comment. Check your connection and try again.");
      return false;
    }
  };

  const remove = (comment: SharedComment) => {
    const removed = comments.filter((item) => item.id === comment.id || item.parentId === comment.id);
    setComments((current) => current.filter((item) => !removed.includes(item)));
    const putBack = () => {
      setComments((current) => [...current, ...removed].toSorted(byCreatedAt));
      toast.error("Couldn't delete the comment. Try again.");
    };
    deleteCommentAction(token, comment.id).then((ok) => ok || putBack(), putBack);
  };

  const resolve = (thread: Thread, resolved: boolean) => {
    const id = thread.comment.id;
    const setResolvedAt = (resolvedAt: string | null) =>
      setComments((current) => current.map((item) => (item.id === id ? { ...item, resolvedAt } : item)));
    setResolvedAt(resolved ? new Date().toISOString() : null);
    if (resolved && activeId === id) setActiveId(null);
    const putBack = () => {
      setResolvedAt(thread.comment.resolvedAt);
      toast.error(`Couldn't ${resolved ? "resolve" : "reopen"} the thread. Try again.`);
    };
    setCommentResolvedAction(token, id, resolved).then((ok) => ok || putBack(), putBack);
  };

  const panel = (
    <CommentsPanel
      threads={threads}
      activeId={activeId}
      allowComments={allowComments}
      owner={owner}
      draft={draft}
      focusComposer={focusComposer}
      onActivate={activate}
      onClearDraft={() => setDraft(null)}
      onPost={post}
      onDelete={remove}
      onResolve={resolve}
      onClose={() => (wide ? setPanelOpen(false) : setSheetOpen(false))}
    />
  );

  const noun = kind === "script" ? "Script" : "Note";
  const subtitle = title === projectTitle ? noun : `${noun} · ${projectTitle}`;
  // Rendered on the server for wide screens, so the panel doesn't pop in; narrow ones drop it once hydrated.
  const showAside = commentsVisible && panelOpen && (wide || !hydrated);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
        <SidebarWordmark className="h-6 shrink-0 max-sm:hidden" />
        <Separator orientation="vertical" className="data-vertical:h-5 data-vertical:self-auto max-sm:hidden" />
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="truncate text-sm font-medium">{title}</h1>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {owner && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={owner.editHref}>
              <PencilIcon data-icon="inline-start" />
              Edit
            </Link>
          </Button>
        )}
        {commentsVisible && (
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={wide ? panelOpen : sheetOpen}
            className="aria-pressed:bg-muted"
            onClick={() => (wide ? setPanelOpen(!panelOpen) : setSheetOpen(true))}
          >
            <MessageSquareIcon data-icon="inline-start" />
            Comments
            {openCount > 0 && <span className="tabular-nums text-muted-foreground">{openCount}</span>}
          </Button>
        )}
      </header>

      {owner && (
        <p className="border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
          {enabled
            ? "This is your shared link, as others see it. Your comments show your name with an Author badge."
            : "This link is turned off, so only you can open it. Turn it back on from Share."}
        </p>
      )}

      <div className="flex flex-1">
        <div
          ref={attachPage}
          onClick={onPageClick}
          className={cn(
            "relative min-w-0 flex-1",
            kind === "script" && "@container/page space-y-6 bg-muted/60 px-3 py-6 sm:space-y-10 sm:px-8 sm:py-10",
          )}
        >
          {children}
          {allowComments && selection && (
            <button
              type="button"
              className="absolute z-20 flex items-center gap-1.5 rounded-full border bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground shadow-md transition-colors hover:bg-muted"
              style={{ top: selection.top, left: selection.left }}
              // Before the tap or click can clear the selection.
              onPointerDown={(event) => {
                event.preventDefault();
                startComment();
              }}
              onClick={startComment}
            >
              <MessageSquarePlusIcon className="size-3.5" />
              Comment
            </button>
          )}
          {allowComments && !wide && hydrated && !sheetOpen && (
            <Button className="fixed right-4 bottom-4 z-20 rounded-full shadow-lg" onClick={startGeneralComment}>
              <MessageSquarePlusIcon data-icon="inline-start" />
              Comment
            </Button>
          )}
        </div>

        {showAside && (
          <aside
            aria-label="Comments"
            className="sticky top-12 hidden h-[calc(100svh-3rem)] w-[22rem] shrink-0 flex-col border-l bg-background lg:flex"
          >
            {panel}
          </aside>
        )}
      </div>

      {commentsVisible && hydrated && !wide && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="right"
            showCloseButton={false}
            className="gap-0 p-0"
            onCloseAutoFocus={(event) => {
              const span = scrollAfterSheet.current;
              if (!span) return;
              event.preventDefault();
              scrollAfterSheet.current = null;
              scrollToSpan(index, span);
            }}
          >
            <SheetTitle className="sr-only">Comments</SheetTitle>
            <SheetDescription className="sr-only">Comments on this {kind}, and a box to add your own.</SheetDescription>
            {panel}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}

/** Threads with their replies, and where each one's passage is in the document now. */
function buildThreads(comments: SharedComment[], index: TextIndex | null, body: HTMLElement | null): Thread[] {
  const replies = new Map<string, SharedComment[]>();
  for (const comment of comments) {
    if (comment.parentId) replies.set(comment.parentId, [...(replies.get(comment.parentId) ?? []), comment]);
  }
  const headings = body ? [...body.querySelectorAll("[data-scene-id]")] : [];

  return comments
    .filter((comment) => !comment.parentId)
    .map((comment) => {
      const span = comment.quote && index ? findQuote(index.text, comment.quote) : null;
      return {
        comment,
        replies: replies.get(comment.id) ?? [],
        span,
        // Until the page is indexed, nothing counts as changed.
        orphaned: !!comment.quote && !!index && !span,
        scene: span && index ? sceneNumber(index, span.start, headings) : null,
      };
    });
}

/** The scene a script passage is in, numbered as the app numbers them: by position. */
function sceneNumber(index: TextIndex, offset: number, headings: Element[]) {
  if (headings.length === 0) return null;
  let block = blockAt(index, offset);
  while (block && !block.hasAttribute("data-scene-id")) block = block.previousElementSibling;
  return block ? headings.indexOf(block) + 1 : null;
}

/** What's selected in the document, trimmed, and where to put the Comment button. */
function readSelection(index: TextIndex, body: HTMLElement, page: HTMLElement | null): Selection | null {
  const selection = window.getSelection();
  if (!page || !selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!range.intersectsNode(body)) return null;

  const span = trimSpan(index.text, {
    start: offsetAt(index, range.startContainer, range.startOffset),
    end: offsetAt(index, range.endContainer, range.endOffset),
  });
  if (span.end <= span.start) return null;

  const rects = range.getClientRects();
  const last = rects[rects.length - 1] ?? range.getBoundingClientRect();
  const box = page.getBoundingClientRect();
  const buttonWidth = 112;
  return {
    span,
    top: last.bottom - box.top + 8,
    left: Math.max(8, Math.min(last.right - box.left - buttonWidth / 2, box.width - buttonWidth - 8)),
  };
}

/** Brings a passage into view, unless it's already comfortably on screen. */
function scrollToSpan(index: TextIndex | null, span: TextSpan) {
  const rect = index && rangeOf(index, span)?.getBoundingClientRect();
  if (!rect) return;
  if (rect.top >= 64 && rect.bottom <= window.innerHeight - 32) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: window.scrollY + rect.top - window.innerHeight / 3, behavior: reduceMotion ? "auto" : "smooth" });
}

function spanLength(span: TextSpan | null) {
  return span ? span.end - span.start : Infinity;
}

function byCreatedAt(a: SharedComment, b: SharedComment) {
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

const subscribeNever = () => () => {};

/** False while rendering on the server and hydrating, true after. */
function useHydrated() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}
