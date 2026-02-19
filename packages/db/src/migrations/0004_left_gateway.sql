CREATE TABLE "billing_webhook_event" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_event_id" text NOT NULL,
	"provider" text DEFAULT 'polar' NOT NULL,
	"event_type" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"status" text DEFAULT 'received' NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"error_message" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_webhook_event_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "organization_billing_account" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'polar' NOT NULL,
	"polar_customer_id" text,
	"polar_subscription_id" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"subscription_status" text DEFAULT 'none' NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"last_webhook_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_billing_account_polar_customer_id_unique" UNIQUE("polar_customer_id"),
	CONSTRAINT "organization_billing_account_polar_subscription_id_unique" UNIQUE("polar_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "organization_entitlement" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"can_create_bug_reports" boolean DEFAULT false NOT NULL,
	"can_upload_video" boolean DEFAULT false NOT NULL,
	"max_video_duration_ms" integer,
	"member_cap" integer,
	"last_computed_at" timestamp DEFAULT now() NOT NULL,
	"source" text DEFAULT 'reconciliation' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_billing_account" ADD CONSTRAINT "organization_billing_account_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_entitlement" ADD CONSTRAINT "organization_entitlement_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_webhook_event_type_idx" ON "billing_webhook_event" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "billing_webhook_status_idx" ON "billing_webhook_event" USING btree ("status");--> statement-breakpoint
CREATE INDEX "org_billing_plan_idx" ON "organization_billing_account" USING btree ("plan");--> statement-breakpoint
CREATE INDEX "org_entitlement_plan_idx" ON "organization_entitlement" USING btree ("plan");