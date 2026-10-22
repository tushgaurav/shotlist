CREATE TABLE "moodboard_items" (
	"id" text PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"position" text NOT NULL,
	"kind" text NOT NULL,
	"wide" boolean DEFAULT false NOT NULL,
	"asset_id" text,
	"caption" text,
	"content" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moodboard_items_kind_check" CHECK ("moodboard_items"."kind" in ('image', 'text', 'palette', 'video_link')),
	CONSTRAINT "moodboard_items_asset_check" CHECK (("moodboard_items"."kind" = 'image') = ("moodboard_items"."asset_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "moodboards" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"columns" integer DEFAULT 3 NOT NULL,
	"position" text NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moodboards_columns_check" CHECK ("moodboards"."columns" between 1 and 4)
);
--> statement-breakpoint
ALTER TABLE "moodboard_items" ADD CONSTRAINT "moodboard_items_board_id_moodboards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."moodboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboard_items" ADD CONSTRAINT "moodboard_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboards" ADD CONSTRAINT "moodboards_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moodboard_items_board_id_idx" ON "moodboard_items" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "moodboards_project_id_idx" ON "moodboards" USING btree ("project_id");