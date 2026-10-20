CREATE TYPE "public"."movement_kind" AS ENUM('Venta', 'Gasto', 'Compra', 'Ajuste Stock');--> statement-breakpoint
CREATE TYPE "public"."sale_order_status" AS ENUM('CONFIRMED', 'VOIDED');--> statement-breakpoint
CREATE TABLE "movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "movements_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"business_date" date NOT NULL,
	"kind" "movement_kind" NOT NULL,
	"category" text,
	"category_id" uuid,
	"description" text NOT NULL,
	"product_id" uuid,
	"product_name" text,
	"quantity" numeric(18, 9) DEFAULT 0 NOT NULL,
	"unit_price" bigint DEFAULT 0 NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"payment_method_id" uuid,
	"payment_method_name" text,
	"supplier_id" uuid,
	"supplier_name" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"voided" boolean DEFAULT false NOT NULL,
	"void_reason" text,
	"voided_by" uuid,
	"voided_at" timestamp with time zone,
	"ticket_id" text,
	"cash_session_id" uuid,
	"sale_order_id" uuid,
	CONSTRAINT "movements_amount_non_negative" CHECK ("movements"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sale_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"sequence" integer DEFAULT 10 NOT NULL,
	"product_id" uuid,
	"product_name" text NOT NULL,
	"quantity" numeric(18, 9) NOT NULL,
	"unit_price" bigint DEFAULT 0 NOT NULL,
	"subtotal" bigint DEFAULT 0 NOT NULL,
	"movement_id" uuid,
	CONSTRAINT "sale_order_lines_quantity_positive" CHECK ("sale_order_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "sale_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" text NOT NULL,
	"business_date" date NOT NULL,
	"cash_session_id" uuid,
	"status" "sale_order_status" DEFAULT 'CONFIRMED' NOT NULL,
	"payment_method_id" uuid,
	"total" bigint DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	CONSTRAINT "sale_orders_ticket_id_unique" UNIQUE("ticket_id"),
	CONSTRAINT "sale_orders_total_non_negative" CHECK ("sale_orders"."total" >= 0)
);
--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_category_id_movement_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."movement_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_sale_order_id_sale_orders_id_fk" FOREIGN KEY ("sale_order_id") REFERENCES "public"."sale_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_order_lines" ADD CONSTRAINT "sale_order_lines_order_id_sale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sale_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_order_lines" ADD CONSTRAINT "sale_order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_order_lines" ADD CONSTRAINT "sale_order_lines_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_movements_date_kind" ON "movements" USING btree ("business_date","kind");--> statement-breakpoint
CREATE INDEX "ix_movements_ticket" ON "movements" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ix_movements_cash_session" ON "movements" USING btree ("cash_session_id");--> statement-breakpoint
CREATE INDEX "ix_movements_number" ON "movements" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_sale_order_lines_movement" ON "sale_order_lines" USING btree ("movement_id");--> statement-breakpoint
CREATE INDEX "ix_sale_order_lines_order" ON "sale_order_lines" USING btree ("order_id","sequence","id");--> statement-breakpoint
CREATE INDEX "ix_sale_orders_date_user" ON "sale_orders" USING btree ("business_date","created_by","status");--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE no action ON UPDATE no action;