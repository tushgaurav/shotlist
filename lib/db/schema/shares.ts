import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { CommentQuote } from "../../share/quotes";
import { notes } from "./notes";
import { projects } from "./projects";
import { scripts } from "./scripts";

/** A read-only link to a script or a note. One per document; turning it off keeps the row. */
export const shares = pgTable(
  "shares",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Exactly one of these: what the link shows.
    scriptId: text("script_id").references(() => scripts.id, { onDelete: "cascade" }),
    noteId: text("note_id").references(() => notes.id, { onDelete: "cascade" }),
    // The secret part of the link. A new one turns the old link off and keeps the comments.
    token: text("token").notNull().unique(),
    enabled: boolean("enabled").default(true).notNull(),
    passwordHash: text("password_hash"),
    // Wrong passwords since the last right one. Too many lock the link for a while.
    failedUnlocks: integer("failed_unlocks").default(0).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    allowComments: boolean("allow_comments").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("shares_project_id_idx").on(table.projectId),
    uniqueIndex("shares_script_id_idx").on(table.scriptId),
    uniqueIndex("shares_note_id_idx").on(table.noteId),
    check("shares_target_check", sql`num_nonnulls(${table.scriptId}, ${table.noteId}) = 1`),
  ],
);

/** Comments left on a shared link, by the people it was sent to and by the owner. */
export const shareComments = pgTable(
  "share_comments",
  {
    id: text("id").primaryKey(),
    shareId: text("share_id")
      .notNull()
      .references(() => shares.id, { onDelete: "cascade" }),
    // Replies point at the comment that started the thread. Threads are one level deep.
    parentId: text("parent_id").references((): AnyPgColumn => shareComments.id, { onDelete: "cascade" }),
    authorName: text("author_name").notNull(),
    // Written by the document's owner, signed in.
    byOwner: boolean("by_owner").default(false).notNull(),
    // SHA-256 of the commenter's cookie, so they can delete and resolve their own comments.
    authorKeyHash: text("author_key_hash"),
    body: text("body").notNull(),
    // The passage it's about, found again by its text as the document changes. Null for a general comment.
    quote: jsonb("quote").$type<CommentQuote>(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("share_comments_share_id_idx").on(table.shareId, table.createdAt)],
);

export type Share = typeof shares.$inferSelect;
export type ShareComment = typeof shareComments.$inferSelect;
