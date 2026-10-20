CREATE TYPE "public"."password_event_type" AS ENUM('CAMBIO_PROPIO', 'RESTABLECIMIENTO_ADMIN');--> statement-breakpoint
CREATE TABLE "password_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "password_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"username" text NOT NULL,
	"type" "password_event_type" NOT NULL,
	"performed_by" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "ix_password_events_user" ON "password_events" USING btree ("username","occurred_at");