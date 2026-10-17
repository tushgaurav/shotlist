import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { PROJECT_KINDS } from "../../projects";
import { user } from "./auth";

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind", { enum: PROJECT_KINDS }).notNull(),
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
