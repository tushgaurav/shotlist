import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";

import type { ProjectTypeIcon } from "../../projects";
import { assets } from "./assets";
import { user } from "./auth";

/** Each user's own list of project types, e.g. "Short Film" or "YouTube Video". */
export const projectTypes = pgTable(
  "project_types",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon").$type<ProjectTypeIcon>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("project_types_owner_name_idx").on(table.ownerId, sql`lower(${table.name})`)],
);

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // Must be one of the owner's types; the data access layer checks.
    typeId: text("type_id").references(() => projectTypes.id, { onDelete: "set null" }),
    logline: text("logline"),
    synopsis: text("synopsis"),
    genre: text("genre"),
    tone: text("tone"),
    targetRuntimeMinutes: integer("target_runtime_minutes"),
    aspectRatio: text("aspect_ratio"),
    language: text("language"),
    // One of the project's own assets.
    coverImageId: text("cover_image_id").references((): AnyPgColumn => assets.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [index("projects_owner_id_idx").on(table.ownerId)],
);

export type Project = typeof projects.$inferSelect;
export type ProjectType = typeof projectTypes.$inferSelect;
