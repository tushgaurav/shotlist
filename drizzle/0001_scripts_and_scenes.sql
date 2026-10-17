CREATE TABLE "scenes" (
	"script_id" text NOT NULL,
	"id" text NOT NULL,
	"position" integer NOT NULL,
	"number" text NOT NULL,
	"heading" text NOT NULL,
	"int_ext" text,
	"location" text,
	"time_of_day" text,
	"content_hash" text NOT NULL,
	"shots_reviewed_hash" text,
	"page_eighths" integer,
	"removed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scenes_script_id_id_pk" PRIMARY KEY("script_id","id")
);
--> statement-breakpoint
CREATE TABLE "scripts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title_page" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"draft" jsonb NOT NULL,
	"draft_revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scripts_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_script_id_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scenes_script_id_position_idx" ON "scenes" USING btree ("script_id","position");