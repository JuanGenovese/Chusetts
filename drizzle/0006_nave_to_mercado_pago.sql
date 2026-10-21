-- "Nave" was a mistake: the digital payment method is "Mercado Pago" (code MERCADO_PAGO).
-- Usual case: rename the seeded row in place so every reference keeps its payment_method_id.
UPDATE "payment_methods" SET "code" = 'MERCADO_PAGO', "name" = 'Mercado Pago', "sequence" = 40
WHERE "code" = 'NAVE' AND NOT EXISTS (SELECT 1 FROM "payment_methods" WHERE "code" = 'MERCADO_PAGO');--> statement-breakpoint
-- If the reference seed already inserted MERCADO_PAGO, move the NAVE references onto it and drop NAVE.
UPDATE "sale_orders" SET "payment_method_id" = (SELECT "id" FROM "payment_methods" WHERE "code" = 'MERCADO_PAGO')
WHERE "payment_method_id" = (SELECT "id" FROM "payment_methods" WHERE "code" = 'NAVE');--> statement-breakpoint
UPDATE "movements" SET "payment_method_id" = (SELECT "id" FROM "payment_methods" WHERE "code" = 'MERCADO_PAGO')
WHERE "payment_method_id" = (SELECT "id" FROM "payment_methods" WHERE "code" = 'NAVE');--> statement-breakpoint
DELETE FROM "payment_methods" WHERE "code" = 'NAVE';--> statement-breakpoint
-- Name snapshots follow the rename.
UPDATE "movements" SET "payment_method_name" = 'Mercado Pago' WHERE "payment_method_name" = 'Nave';
