CREATE TABLE "project_types" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "type_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "logline" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "synopsis" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "genre" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "tone" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "target_runtime_minutes" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "aspect_ratio" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "cover_image_id" text;--> statement-breakpoint
ALTER TABLE "project_types" ADD CONSTRAINT "project_types_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_types_owner_name_idx" ON "project_types" USING btree ("owner_id",lower("name"));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_type_id_project_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."project_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_cover_image_id_assets_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Every existing account gets the default types (DEFAULT_PROJECT_TYPES in lib/projects.ts).
INSERT INTO "project_types" ("id", "owner_id", "name", "icon")
SELECT replace(gen_random_uuid()::text, '-', ''), "user"."id", defaults."name", defaults."icon"
FROM "user"
CROSS JOIN (VALUES
	('Short film', 'film'),
	('Feature film', 'projector'),
	('Commercial', 'megaphone'),
	('Music video', 'music')
) AS defaults ("name", "icon");--> statement-breakpoint
-- Projects of kind 'other' are left without a type.
UPDATE "projects"
SET "type_id" = "project_types"."id"
FROM "project_types"
WHERE "project_types"."owner_id" = "projects"."owner_id"
	AND "project_types"."name" = CASE "projects"."kind"
		WHEN 'short' THEN 'Short film'
		WHEN 'feature' THEN 'Feature film'
		WHEN 'commercial' THEN 'Commercial'
		WHEN 'music_video' THEN 'Music video'
	END;