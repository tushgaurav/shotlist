import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { ImageType } from "../../shots/images";
import { projects } from "./projects";

/** Uploaded images. Rows are never removed when a shot drops its image, so Undo can bring it back. */
export const assets = pgTable(
  "assets",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    contentType: text("content_type").$type<ImageType>().notNull(),
    storageKey: text("storage_key").notNull(),
    thumbKey: text("thumb_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    // Both stored copies together.
    byteSize: integer("byte_size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("assets_project_id_idx").on(table.projectId)],
);

export type Asset = typeof assets.$inferSelect;
