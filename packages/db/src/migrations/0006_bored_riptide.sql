ALTER TABLE "organization_entitlement" ADD COLUMN "entitlements" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "organization_entitlement"
SET "entitlements" = jsonb_build_object(
  'canCreateBugReports',
  "can_create_bug_reports",
  'canUploadVideo',
  "can_upload_video",
  'maxVideoDurationMs',
  "max_video_duration_ms",
  'memberCap',
  "member_cap"
);--> statement-breakpoint
ALTER TABLE "organization_entitlement" DROP COLUMN "can_create_bug_reports";--> statement-breakpoint
ALTER TABLE "organization_entitlement" DROP COLUMN "can_upload_video";--> statement-breakpoint
ALTER TABLE "organization_entitlement" DROP COLUMN "max_video_duration_ms";--> statement-breakpoint
ALTER TABLE "organization_entitlement" DROP COLUMN "member_cap";
