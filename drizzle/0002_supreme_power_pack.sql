CREATE TYPE "public"."movement_category_kind" AS ENUM('Ingreso', 'Gasto', 'Compra');--> statement-breakpoint
CREATE TYPE "public"."unit_magnitude" AS ENUM('unidad', 'volumen', 'peso');--> statement-breakpoint
CREATE TABLE "movement_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "movement_category_kind" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "movement_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sequence" integer DEFAULT 10 NOT NULL,
	CONSTRAINT "payment_methods_code_unique" UNIQUE("code"),
	CONSTRAINT "payment_methods_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sequence" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "products_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"sku" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category_id" uuid NOT NULL,
	"sale_price" bigint DEFAULT 0 NOT NULL,
	"unit_cost" bigint DEFAULT 0 NOT NULL,
	"min_stock" numeric(18, 9) DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_sellable" boolean DEFAULT true NOT NULL,
	"is_purchasable" boolean DEFAULT true NOT NULL,
	"is_supply" boolean DEFAULT false NOT NULL,
	"is_compound" boolean DEFAULT false NOT NULL,
	"controls_stock" boolean DEFAULT true NOT NULL,
	"stock_unit" text DEFAULT 'unidad' NOT NULL,
	"stock_unit_id" uuid NOT NULL,
	"purchase_unit" text DEFAULT 'unidad' NOT NULL,
	"purchase_factor" numeric(18, 9) DEFAULT 1 NOT NULL,
	"supplier_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" uuid,
	CONSTRAINT "products_name_unique" UNIQUE("name"),
	CONSTRAINT "products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "products_sale_price_non_negative" CHECK ("products"."sale_price" >= 0),
	CONSTRAINT "products_unit_cost_non_negative" CHECK ("products"."unit_cost" >= 0),
	CONSTRAINT "products_min_stock_non_negative" CHECK ("products"."min_stock" >= 0),
	CONSTRAINT "products_purchase_factor_positive" CHECK ("products"."purchase_factor" > 0)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"legal_name" text DEFAULT '' NOT NULL,
	"tax_id" text DEFAULT '' NOT NULL,
	"business" text DEFAULT '' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"magnitude" "unit_magnitude" NOT NULL,
	"base_factor" numeric(18, 9) DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "units_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "recipe_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_product_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"quantity" numeric(18, 9) NOT NULL,
	"unit" text NOT NULL,
	"stock_quantity" numeric(18, 9) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "recipe_components_quantity_positive" CHECK ("recipe_components"."quantity" > 0),
	CONSTRAINT "recipe_components_not_self" CHECK ("recipe_components"."sale_product_id" <> "recipe_components"."component_id")
);
--> statement-breakpoint
CREATE TABLE "stock_levels" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"quantity" numeric(18, 9) DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence" bigint GENERATED ALWAYS AS IDENTITY (sequence name "stock_movements_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"movement_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_delta" numeric(18, 9) NOT NULL,
	"type" text NOT NULL,
	"reason" text NOT NULL,
	"stock_before" numeric(18, 9) NOT NULL,
	"stock_after" numeric(18, 9) NOT NULL,
	"actor_id" uuid NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" text NOT NULL,
	"origin_key" text,
	"created_at" timestamp with time zone NOT NULL,
	"reverted" boolean DEFAULT false NOT NULL,
	"reverted_at" timestamp with time zone,
	"reverted_by" uuid,
	CONSTRAINT "stock_movements_origin_key_unique" UNIQUE("origin_key")
);
--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stock_unit_id_units_id_fk" FOREIGN KEY ("stock_unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_sale_product_id_products_id_fk" FOREIGN KEY ("sale_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_component_id_products_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reverted_by_users_id_fk" FOREIGN KEY ("reverted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_product_categories_name" ON "product_categories" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "ix_products_active_category" ON "products" USING btree ("active","category_id");--> statement-breakpoint
CREATE INDEX "ix_products_supplier" ON "products" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_suppliers_name" ON "suppliers" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "ux_suppliers_tax_id" ON "suppliers" USING btree ("tax_id") WHERE "suppliers"."tax_id" <> '';--> statement-breakpoint
CREATE UNIQUE INDEX "ux_recipe_components_pair" ON "recipe_components" USING btree ("sale_product_id","component_id");--> statement-breakpoint
CREATE INDEX "ix_recipe_components_component" ON "recipe_components" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "ix_stock_movements_movement" ON "stock_movements" USING btree ("movement_id","reverted");--> statement-breakpoint
CREATE INDEX "ix_stock_movements_product" ON "stock_movements" USING btree ("product_id","sequence");