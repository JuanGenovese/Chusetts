CREATE TYPE "public"."user_role" AS ENUM('admin', 'cashier');--> statement-breakpoint
CREATE TYPE "public"."cash_event_type" AS ENUM('OPENING', 'CLOSING');--> statement-breakpoint
CREATE TYPE "public"."cash_movement_type" AS ENUM('OPENING', 'MANUAL_INCOME', 'WITHDRAWAL', 'CASH_EXPENSE', 'POSITIVE_ADJUSTMENT', 'NEGATIVE_ADJUSTMENT', 'CASH_SALE', 'CASH_OUTFLOW', 'SALE_REFUND', 'OUTFLOW_REVERSAL', 'CLOSING');--> statement-breakpoint
CREATE TYPE "public"."cash_session_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "user_role" DEFAULT 'cashier' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "cash_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"type" "cash_event_type" NOT NULL,
	"actor_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"type" "cash_movement_type" NOT NULL,
	"amount" bigint NOT NULL,
	"sign" smallint NOT NULL,
	"description" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"reference_key" text,
	"balance_before" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	CONSTRAINT "cash_movements_reference_key_unique" UNIQUE("reference_key"),
	CONSTRAINT "cash_movements_amount_non_negative" CHECK ("cash_movements"."amount" >= 0),
	CONSTRAINT "cash_movements_sign_valid" CHECK ("cash_movements"."sign" in (-1, 0, 1))
);
--> statement-breakpoint
CREATE TABLE "cash_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_date" date NOT NULL,
	"opened_by" uuid NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"opening_cash" bigint DEFAULT 0 NOT NULL,
	"status" "cash_session_status" DEFAULT 'OPEN' NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"expected_cash" bigint,
	"expected_transfer" bigint,
	"expected_card" bigint,
	"expected_mercado_pago" bigint,
	"expected_other" bigint,
	"counted_cash" bigint,
	"counted_transfer" bigint,
	"counted_card" bigint,
	"counted_mercado_pago" bigint,
	"counted_other" bigint,
	"difference" bigint,
	"opening_notes" text DEFAULT '' NOT NULL,
	"closing_notes" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "cash_sessions_opening_cash_non_negative" CHECK ("cash_sessions"."opening_cash" >= 0)
);
--> statement-breakpoint
ALTER TABLE "cash_events" ADD CONSTRAINT "cash_events_session_id_cash_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_events" ADD CONSTRAINT "cash_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_session_id_cash_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_cash_events_session_time" ON "cash_events" USING btree ("session_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ix_cash_movements_session_time" ON "cash_movements" USING btree ("session_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "ix_cash_movements_type_time" ON "cash_movements" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_cash_sessions_one_open_per_user" ON "cash_sessions" USING btree ("opened_by") WHERE "cash_sessions"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "ix_cash_sessions_date_status" ON "cash_sessions" USING btree ("business_date","status");