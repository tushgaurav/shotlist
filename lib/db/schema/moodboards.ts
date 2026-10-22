import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { ItemContent, ItemKind } from "../../moodboards/types";
import { assets } from "./assets";
import { projects } from "./projects";

export const moodboards = pgTable(
  "moodboards",
  {
    // Generated in the browser, so creates can be retried safely.
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    columns: integer("columns").default(3).notNull(),
    // Order in the boards list.
    position: text("position").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    // Soft delete, so Undo can bring a board back.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // Also set by every change to the board's items.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("moodboards_project_id_idx").on(table.projectId),
    check("moodboards_columns_check", sql`${table.columns} between 1 and 4`),
  ],
);

export const moodboardItems = pgTable(
  "moodboard_items",
  {
    // Generated in the browser, so creates can be retried safely.
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => moodboards.id, { onDelete: "cascade" }),
    // One order for the whole board; the columns are worked out from it.
    position: text("position").notNull(),
    kind: text("kind").$type<ItemKind>().notNull(),
    // Spans every column.
    wide: boolean("wide").default(false).notNull(),
    // Image items. An image item means nothing without its image.
    assetId: text("asset_id").references(() => assets.id, { onDelete: "cascade" }),
    // Image or video link caption, palette name.
    caption: text("caption"),
    // Text, palette or video link; see lib/moodboards/types.ts.
    content: jsonb("content").$type<ItemContent>(),
    // Soft delete, so Undo can bring an item back.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("moodboard_items_board_id_idx").on(table.boardId),
    check("moodboard_items_kind_check", sql`${table.kind} in ('image', 'text', 'palette', 'video_link')`),
    check(
      "moodboard_items_asset_check",
      sql`(${table.kind} = 'image') = (${table.assetId} is not null)`,
    ),
  ],
);

export type Moodboard = typeof moodboards.$inferSelect;
export type MoodboardItemRow = typeof moodboardItems.$inferSelect;
