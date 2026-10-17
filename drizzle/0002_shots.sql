CREATE TABLE "shots" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"script_id" text NOT NULL,
	"scene_id" text,
	"position" text NOT NULL,
	"suffix" text,
	"custom_label" text,
	"description" text DEFAULT '' NOT NULL,
	"size" text,
	"shot_type" text,
	"angle" text,
	"movement" text,
	"lens" text,
	"camera" text,
	"frame_rate" text,
	"subjects" text,
	"equipment" text,
	"sound" text,
	"location_note" text,
	"vfx" boolean DEFAULT false NOT NULL,
	"est_shoot_minutes" integer,
	"status" text DEFAULT 'planned' NOT NULL,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shots_status_check" CHECK ("shots"."status" in ('planned', 'shot', 'omitted')),
	CONSTRAINT "shots_est_shoot_minutes_check" CHECK ("shots"."est_shoot_minutes" is null or "shots"."est_shoot_minutes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_script_id_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_scene_fk" FOREIGN KEY ("script_id","scene_id") REFERENCES "public"."scenes"("script_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shots_project_id_idx" ON "shots" USING btree ("project_id");