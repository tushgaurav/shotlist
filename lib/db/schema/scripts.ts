import { index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import type { ScreenplayDocJSON, TitlePage } from "../../screenplay/types";
import { projects } from "./projects";

export const scripts = pgTable("scripts", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  titlePage: jsonb("title_page").$type<TitlePage>().default({}).notNull(),
  draft: jsonb("draft").$type<ScreenplayDocJSON>().notNull(),
  draftRevision: integer("draft_revision").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Scene IDs are generated in the browser, so they're only unique within a script.
export const scenes = pgTable(
  "scenes",
  {
    scriptId: text("script_id")
      .notNull()
      .references(() => scripts.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    position: integer("position").notNull(),
    number: text("number").notNull(),
    heading: text("heading").notNull(),
    intExt: text("int_ext"),
    location: text("location"),
    timeOfDay: text("time_of_day"),
    contentHash: text("content_hash").notNull(),
    shotsReviewedHash: text("shots_reviewed_hash"),
    pageEighths: integer("page_eighths"),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scriptId, table.id] }),
    index("scenes_script_id_position_idx").on(table.scriptId, table.position),
  ],
);

export type Script = typeof scripts.$inferSelect;
export type Scene = typeof scenes.$inferSelect;
