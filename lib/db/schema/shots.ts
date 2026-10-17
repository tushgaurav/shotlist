import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import type { ShotStatus } from "../../shots/types";
import { assets } from "./assets";
import { projects } from "./projects";
import { scenes, scripts } from "./scripts";

export const shots = pgTable(
  "shots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Always the project's script; it's here so scene_id can reference scenes (script_id, id).
    scriptId: text("script_id")
      .notNull()
      .references(() => scripts.id, { onDelete: "cascade" }),
    sceneId: text("scene_id"),
    position: text("position").notNull(),
    suffix: text("suffix"),
    customLabel: text("custom_label"),
    description: text("description").default("").notNull(),
    size: text("size"),
    shotType: text("shot_type"),
    angle: text("angle"),
    movement: text("movement"),
    lens: text("lens"),
    camera: text("camera"),
    frameRate: text("frame_rate"),
    subjects: text("subjects"),
    equipment: text("equipment"),
    sound: text("sound"),
    locationNote: text("location_note"),
    vfx: boolean("vfx").default(false).notNull(),
    estShootMinutes: integer("est_shoot_minutes"),
    status: text("status").$type<ShotStatus>().default("planned").notNull(),
    notes: text("notes"),
    imageId: text("image_id").references(() => assets.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "shots_scene_fk",
      columns: [table.scriptId, table.sceneId],
      foreignColumns: [scenes.scriptId, scenes.id],
    }),
    index("shots_project_id_idx").on(table.projectId),
    check("shots_status_check", sql`${table.status} in ('planned', 'shot', 'omitted')`),
    check(
      "shots_est_shoot_minutes_check",
      sql`${table.estShootMinutes} is null or ${table.estShootMinutes} >= 0`,
    ),
  ],
);

export type Shot = typeof shots.$inferSelect;
