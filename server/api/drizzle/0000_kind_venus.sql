CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model_id" text NOT NULL,
	"display_name" text NOT NULL,
	"tier_required" text DEFAULT 'free' NOT NULL,
	"input_cost_units" integer NOT NULL,
	"output_cost_units" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_monthly_usage" (
	"user_id" text NOT NULL,
	"year_month" text NOT NULL,
	"total_cost_units" bigint DEFAULT 0 NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_monthly_usage_user_id_year_month_pk" PRIMARY KEY("user_id","year_month")
);
--> statement-breakpoint
CREATE TABLE "ai_tier_budgets" (
	"tier" text PRIMARY KEY NOT NULL,
	"monthly_budget_units" integer NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "ai_usage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"model_id" text NOT NULL,
	"feature" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_units" integer NOT NULL,
	"api_mode" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ghost_links" (
	"link_text" text NOT NULL,
	"source_page_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"original_target_page_id" uuid,
	"original_note_id" uuid,
	CONSTRAINT "ghost_links_link_text_source_page_id_pk" PRIMARY KEY("link_text","source_page_id")
);
--> statement-breakpoint
CREATE TABLE "links" (
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "links_source_id_target_id_pk" PRIMARY KEY("source_id","target_id"),
	CONSTRAINT "links_no_self_ref" CHECK ("links"."source_id" != "links"."target_id")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"page_id" uuid,
	"s3_key" text NOT NULL,
	"file_name" text,
	"content_type" text,
	"file_size" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_members" (
	"note_id" uuid NOT NULL,
	"member_email" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"invited_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "note_members_note_id_member_email_pk" PRIMARY KEY("note_id","member_email")
);
--> statement-breakpoint
CREATE TABLE "note_pages" (
	"note_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"added_by_user_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "note_pages_note_id_page_id_pk" PRIMARY KEY("note_id","page_id")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"edit_permission" text DEFAULT 'owner_only' NOT NULL,
	"is_official" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_contents" (
	"page_id" uuid PRIMARY KEY NOT NULL,
	"ydoc_state" "bytea" NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"content_text" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"source_page_id" uuid,
	"title" text,
	"content_preview" text,
	"thumbnail_url" text,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"external_id" text,
	"external_customer_id" text,
	"billing_interval" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_user_id_key" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "thumbnail_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"s3_key" varchar(512) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thumbnail_tier_quotas" (
	"tier" varchar(32) PRIMARY KEY NOT NULL,
	"storage_limit_bytes" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_monthly_usage" ADD CONSTRAINT "ai_monthly_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghost_links" ADD CONSTRAINT "ghost_links_source_page_id_pages_id_fk" FOREIGN KEY ("source_page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghost_links" ADD CONSTRAINT "ghost_links_original_target_page_id_pages_id_fk" FOREIGN KEY ("original_target_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghost_links" ADD CONSTRAINT "ghost_links_original_note_id_notes_id_fk" FOREIGN KEY ("original_note_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_source_id_pages_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_target_id_pages_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_members" ADD CONSTRAINT "note_members_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_members" ADD CONSTRAINT "note_members_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_pages" ADD CONSTRAINT "note_pages_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_pages" ADD CONSTRAINT "note_pages_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_pages" ADD CONSTRAINT "note_pages_added_by_user_id_user_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_contents" ADD CONSTRAINT "page_contents_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_models_provider" ON "ai_models" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "idx_ai_models_active" ON "ai_models" USING btree ("is_active") WHERE "ai_models"."is_active";--> statement-breakpoint
CREATE INDEX "idx_ai_usage_logs_user_month" ON "ai_usage_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_logs_model" ON "ai_usage_logs" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "idx_ghost_links_link_text" ON "ghost_links" USING btree ("link_text");--> statement-breakpoint
CREATE INDEX "idx_ghost_links_source_page_id" ON "ghost_links" USING btree ("source_page_id");--> statement-breakpoint
CREATE INDEX "idx_links_source_id" ON "links" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "idx_links_target_id" ON "links" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "idx_media_owner_id" ON "media" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_media_page_id" ON "media" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "idx_note_members_note_id" ON "note_members" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "idx_note_members_email" ON "note_members" USING btree ("member_email");--> statement-breakpoint
CREATE INDEX "idx_note_pages_note_id" ON "note_pages" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "idx_note_pages_page_id" ON "note_pages" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "idx_notes_owner_id" ON "notes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_notes_visibility" ON "notes" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "idx_notes_edit_permission" ON "notes" USING btree ("edit_permission");--> statement-breakpoint
CREATE INDEX "idx_notes_is_official" ON "notes" USING btree ("is_official");--> statement-breakpoint
CREATE INDEX "idx_pages_owner_id" ON "pages" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_pages_owner_updated" ON "pages" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_pages_source_page_id" ON "pages" USING btree ("source_page_id");--> statement-breakpoint
CREATE INDEX "idx_pages_is_deleted" ON "pages" USING btree ("owner_id") WHERE NOT "pages"."is_deleted";--> statement-breakpoint
CREATE INDEX "idx_subscriptions_user_id" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_external_id" ON "subscriptions" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "idx_thumbnail_objects_user_id" ON "thumbnail_objects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_email" ON "user" USING btree ("email");