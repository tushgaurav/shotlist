import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { NoteDocJSON } from "../../notes/types";
import { projects } from "./projects";

export const notes = pgTable(
  "notes",
  {
    // Generated in the browser. A note is first written when its first save arrives.
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    content: jsonb("content").$type<NoteDocJSON>().notNull(),
    // Plain-text rendering, for the notes list, search and the AI.
    text: text("text").default("").notNull(),
    revision: integer("revision").default(1).notNull(),
    // Soft delete, so Undo can bring a note back.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("notes_project_id_idx").on(table.projectId)],
);

export type Note = typeof notes.$inferSelect;
