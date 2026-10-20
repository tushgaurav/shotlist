"use client";

import { cn } from "cn";
import { CheckIcon, EllipsisIcon, RotateCcwIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CommentQuote, TextSpan } from "@/lib/share/quotes";
import { COMMENT_MAX_LENGTH, COMMENTER_NAME_MAX_LENGTH, type SharedComment } from "@/lib/share/types";
import { useLocalStorage, writeLocalStorage } from "@/lib/use-local-storage";

import type { Draft } from "./share-view";

/** People with the link type their name once; it's remembered for every link. */
const NAME_KEY = "shotlist:commenter-name";

export type Thread = {
  comment: SharedComment;
  replies: SharedComment[];
  /** Where the passage is now. Null for a general comment, or once the passage changed. */
  span: TextSpan | null;
  /** The passage was edited or removed since the comment was written. */
  orphaned: boolean;
  /** The scene the passage is in, for scripts. */
  scene: number | null;
};

export type NewComment = { body: string; quote: CommentQuote | null; parentId: string | null; authorName: string };

type Props = {
  threads: Thread[];
  activeId: string | null;
  allowComments: boolean;
  owner: { name: string } | null;
  draft: Draft | null;
  /** Bumped to put the cursor in the comment box. */
  focusComposer: number;
  onActivate: (thread: Thread) => void;
  onClearDraft: () => void;
  onPost: (comment: NewComment) => Promise<boolean>;
  onDelete: (comment: SharedComment) => void;
  onResolve: (thread: Thread, resolved: boolean) => void;
  onClose: () => void;
};

export function CommentsPanel({
  threads,
  activeId,
  allowComments,
  owner,
  draft,
  focusComposer,
  onActivate,
  onClearDraft,
  onPost,
  onDelete,
  onResolve,
  onClose,
}: Props) {
  const [showResolved, setShowResolved] = useState(false);

  // Passages in document order, then general comments and ones whose passage changed.
  const open = threads
    .filter((thread) => !thread.comment.resolvedAt)
    .toSorted((a, b) => {
      if (a.span && b.span) return a.span.start - b.span.start;
      if (a.span || b.span) return a.span ? -1 : 1;
      return a.comment.createdAt < b.comment.createdAt ? -1 : 1;
    });
  const resolved = threads.filter((thread) => thread.comment.resolvedAt);

  // Scrolls just the list: scrollIntoView would scroll the document too.
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = list.current;
    const card = activeId ? document.getElementById(threadElementId(activeId)) : null;
    if (!container || !card || !container.contains(card)) return;
    const box = container.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    if (rect.top < box.top) container.scrollTop -= box.top - rect.top + 12;
    else if (rect.bottom > box.bottom) container.scrollTop += Math.min(rect.bottom - box.bottom + 12, rect.top - box.top - 12);
  }, [activeId]);

  const card = (thread: Thread) => (
    <ThreadCard
      key={thread.comment.id}
      thread={thread}
      active={thread.comment.id === activeId}
      allowComments={allowComments}
      owner={owner}
      onActivate={onActivate}
      onPost={onPost}
      onDelete={onDelete}
      onResolve={onResolve}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b pr-2 pl-4">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Comments <span className="ml-1 tabular-nums">{open.length}</span>
        </h2>
        <Button variant="ghost" size="icon-sm" aria-label="Hide Comments" onClick={onClose}>
          <XIcon />
        </Button>
      </div>

      <div ref={list} className="flex-1 overflow-y-auto p-3">
        {open.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-balance text-muted-foreground">
            {allowComments
              ? "No comments yet. Select any text to comment on it, or write a general comment below."
              : "No open comments."}
          </p>
        )}
        <ul className="flex flex-col gap-2">{open.map(card)}</ul>
        {resolved.length > 0 && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full text-muted-foreground"
              aria-expanded={showResolved}
              onClick={() => setShowResolved(!showResolved)}
            >
              {showResolved ? "Hide" : "Show"} {resolved.length} Resolved
            </Button>
            {showResolved && <ul className="mt-2 flex flex-col gap-2">{resolved.map(card)}</ul>}
          </>
        )}
      </div>

      <div className="shrink-0 border-t p-3">
        {allowComments ? (
          <Composer
            quote={draft?.quote ?? null}
            parentId={null}
            owner={owner}
            focus={focusComposer}
            placeholder={draft ? "Comment on this passage…" : "Add a comment…"}
            submitLabel="Comment"
            onCancel={draft ? onClearDraft : undefined}
            onPost={onPost}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            {owner ? "Comments are off. Turn them on from Share to let people reply." : "Comments are turned off."}
          </p>
        )}
      </div>
    </div>
  );
}

const threadElementId = (id: string) => `comment-${id}`;

function ThreadCard({
  thread,
  active,
  allowComments,
  owner,
  onActivate,
  onPost,
  onDelete,
  onResolve,
}: {
  thread: Thread;
  active: boolean;
  allowComments: boolean;
  owner: { name: string } | null;
  onActivate: (thread: Thread) => void;
  onPost: (comment: NewComment) => Promise<boolean>;
  onDelete: (comment: SharedComment) => void;
  onResolve: (thread: Thread, resolved: boolean) => void;
}) {
  const { comment, replies, orphaned, scene } = thread;
  const resolved = comment.resolvedAt !== null;
  // The owner looks after every thread; anyone else, their own.
  const canResolve = owner !== null || (comment.mine && allowComments);
  const canDelete = (item: SharedComment) => owner !== null || (item.mine && allowComments);

  return (
    <li id={threadElementId(comment.id)}>
      <article
        aria-current={active || undefined}
        onClick={(event) => {
          if (!active && !(event.target as Element).closest("button, a, input, textarea, [role=menu]")) onActivate(thread);
        }}
        className={cn(
          "flex flex-col gap-3 rounded-lg border bg-card p-3 text-sm transition-colors",
          active ? "border-ring ring-3 ring-ring/20" : "cursor-pointer hover:border-foreground/20",
          resolved && !active && "opacity-75",
        )}
      >
        {(comment.quote || scene) && (
          <button
            type="button"
            disabled={!thread.span}
            className="flex flex-col gap-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default"
            onClick={() => onActivate(thread)}
          >
            {scene && (
              <span className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
                Scene {scene}
              </span>
            )}
            {comment.quote && (
              <span
                className={cn(
                  "line-clamp-3 border-l-2 pl-2 text-xs whitespace-pre-line text-muted-foreground",
                  orphaned ? "border-border line-through decoration-muted-foreground/50" : "border-amber-400",
                )}
              >
                {comment.quote.exact}
              </span>
            )}
          </button>
        )}
        {orphaned && <p className="-mt-2 text-xs text-muted-foreground">This text has changed since.</p>}

        <CommentItem
          comment={comment}
          canDelete={canDelete(comment)}
          onDelete={onDelete}
          resolveAction={
            canResolve && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={resolved ? "Reopen" : "Resolve"}
                    onClick={() => onResolve(thread, !resolved)}
                  >
                    {resolved ? <RotateCcwIcon /> : <CheckIcon />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{resolved ? "Reopen" : "Resolve"}</TooltipContent>
              </Tooltip>
            )
          }
        />
        {replies.map((reply) => (
          <CommentItem key={reply.id} comment={reply} canDelete={canDelete(reply)} onDelete={onDelete} />
        ))}

        {active && allowComments && !resolved && (
          <Composer
            quote={null}
            parentId={comment.id}
            owner={owner}
            placeholder="Reply…"
            submitLabel="Reply"
            onPost={onPost}
          />
        )}
      </article>
    </li>
  );
}

function CommentItem({
  comment,
  canDelete,
  onDelete,
  resolveAction,
}: {
  comment: SharedComment;
  canDelete: boolean;
  onDelete: (comment: SharedComment) => void;
  resolveAction?: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      <span
        aria-hidden
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold uppercase",
          comment.byOwner ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {comment.authorName.trim().charAt(0) || "?"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-h-6 items-center gap-1.5">
          <span className="truncate font-medium">{comment.authorName}</span>
          {comment.byOwner && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[0.625rem]">
              Author
            </Badge>
          )}
          <CommentTime value={comment.createdAt} />
          <div className="ml-auto flex shrink-0 items-center">
            {resolveAction}
            {canDelete && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label="Comment Actions">
                    <EllipsisIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="destructive" onSelect={() => onDelete(comment)}>
                    <Trash2Icon />
                    {comment.parentId ? "Delete Reply" : "Delete Thread"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <p className="text-sm break-words whitespace-pre-wrap">{comment.body}</p>
      </div>
    </div>
  );
}

function Composer({
  quote,
  parentId,
  owner,
  focus,
  placeholder,
  submitLabel,
  onCancel,
  onPost,
}: {
  quote: CommentQuote | null;
  parentId: string | null;
  owner: { name: string } | null;
  focus?: number;
  placeholder: string;
  submitLabel: string;
  onCancel?: () => void;
  onPost: (comment: NewComment) => Promise<boolean>;
}) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const savedName = useLocalStorage(NAME_KEY);
  const [name, setName] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focus) textarea.current?.focus({ preventScroll: true });
  }, [focus]);

  // The owner comments under their account's name; anyone else is asked once.
  const editingName = !owner && (name !== null || !savedName);
  const authorName = owner?.name ?? (editingName ? (name ?? "") : (savedName ?? "")).trim();
  const ready = body.trim().length > 0 && authorName.length > 0 && !pending;

  const submit = async () => {
    if (!ready) return;
    setPending(true);
    const posted = await onPost({ body, quote, parentId, authorName });
    setPending(false);
    if (!posted) return;
    // Anything typed while it was posting stays.
    setBody((current) => (current === body ? "" : current));
    if (!owner) {
      writeLocalStorage(NAME_KEY, authorName);
      setName(null);
    }
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {quote && (
        <div className="flex items-start gap-2 rounded-md bg-muted/60 py-1.5 pr-1 pl-2">
          <p className="line-clamp-2 flex-1 border-l-2 border-amber-400 pl-2 text-xs whitespace-pre-line text-muted-foreground">
            {quote.exact}
          </p>
          {onCancel && (
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Don't Comment on This Passage" onClick={onCancel}>
              <XIcon />
            </Button>
          )}
        </div>
      )}
      {editingName && (
        <Input
          aria-label="Your Name"
          placeholder="Your name"
          autoComplete="name"
          maxLength={COMMENTER_NAME_MAX_LENGTH}
          value={name ?? ""}
          onChange={(event) => setName(event.target.value)}
        />
      )}
      <Textarea
        ref={textarea}
        aria-label={parentId ? "Reply" : "Comment"}
        placeholder={placeholder}
        rows={2}
        maxLength={COMMENT_MAX_LENGTH}
        value={body}
        className="max-h-48 min-h-14"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          } else if (event.key === "Escape" && onCancel) {
            onCancel();
          }
        }}
      />
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {owner ? (
            <>As {owner.name}, the author</>
          ) : !editingName && savedName ? (
            <>
              As {savedName} ·{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => setName(savedName)}
              >
                Change
              </button>
            </>
          ) : null}
        </p>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!ready}>
          {pending ? "Posting…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

const subscribe = () => () => {};
const serverFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-US", { timeStyle: "short" });
const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

// Today's comments show the time, older ones the date. The server doesn't know the viewer's
// time zone, so it renders the UTC date and the browser swaps in the local one.
function CommentTime({ value }: { value: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => localLabel(new Date(value)),
    () => serverFormat.format(new Date(value)),
  );
  return (
    <time dateTime={value} className="shrink-0 text-xs text-muted-foreground">
      {text}
    </time>
  );
}

function localLabel(date: Date) {
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return timeFormat.format(date);
  return (date.getFullYear() === now.getFullYear() ? dayFormat : dateFormat).format(date);
}
