CREATE TABLE "share_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"share_id" text NOT NULL,
	"parent_id" text,
	"author_name" text NOT NULL,
	"by_owner" boolean DEFAULT false NOT NULL,
	"author_key_hash" text,
	"body" text NOT NULL,
	"quote" jsonb,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"script_id" text,
	"note_id" text,
	"token" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"password_hash" text,
	"failed_unlocks" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"allow_comments" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shares_token_unique" UNIQUE("token"),
	CONSTRAINT "shares_target_check" CHECK (num_nonnulls("shares"."script_id", "shares"."note_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "share_comments" ADD CONSTRAINT "share_comments_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_comments" ADD CONSTRAINT "share_comments_parent_id_share_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."share_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_script_id_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_comments_share_id_idx" ON "share_comments" USING btree ("share_id","created_at");--> statement-breakpoint
CREATE INDEX "shares_project_id_idx" ON "shares" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shares_script_id_idx" ON "shares" USING btree ("script_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shares_note_id_idx" ON "shares" USING btree ("note_id");