"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatMoneyCompact } from "@/shared/domain/money";
import { formatQuantityLabel } from "@/shared/domain/format";
import { Alert, Button, Columns, Field, PageHeader, Select, Subheader, TextArea } from "@/shared/ui";
import { cartTotal, lineSubtotal, toSaleLines, type Cart, type CartItem } from "./cart";
import { cartActions, getCart, useCart } from "./cart-store";
import type { PosData, PosProduct, SaleAction } from "./types";

const NO_CATEGORY = "Sin categoría";
const categoryOf = (p: PosProduct) => p.category || NO_CATEGORY;

function ProductCard({ product }: { product: PosProduct }) {
  const { available } = product;
  const unavailable = available !== null && available < 1;
  return (
    <>
      <div className="product-card md" style={{ "--mb": "10px" } as React.CSSProperties}>
        <div>
          <div className="product-name">{product.name}</div>
          <div className="product-meta">{categoryOf(product)}</div>
        </div>
        <div className="product-card-footer">
          <div className="product-stock">{available === null ? "Sin control" : String(Math.trunc(available))}</div>
          <div className="product-price">{formatMoneyCompact(product.price)}</div>
        </div>
      </div>
      <Button
        block
        variant="secondary"
        disabled={unavailable}
        onClick={() => cartActions.add({ id: product.id, name: product.name, category: product.category, price: product.price })}
      >
        {unavailable ? "Sin stock o receta" : "Agregar"}
      </Button>
    </>
  );
}

function CartLine({ item }: { item: CartItem }) {
  return (
    <div className="cart-item">
      <Columns weights={[2.4, 1.1]}>
        <div className="md">
          <div className="cart-product-name">{item.name}</div>
          <div className="cart-product-meta">{formatMoneyCompact(item.unitPrice)} c/u</div>
        </div>
        <div className="md">
          <div className="cart-subtotal-label">Subtotal</div>
          <div className="cart-subtotal-value">{formatMoneyCompact(lineSubtotal(item))}</div>
        </div>
      </Columns>
      <div className="cart-row-separator md" />
      {/* Legacy has [−][qty][＋][Quitar]; − and ＋ are hidden by its CSS, their columns keep the layout. */}
      <Columns weights={[0.65, 1.05, 0.65, 1.45]}>
        <div aria-hidden />
        <div className="cart-qty-display md">{formatQuantityLabel(item.quantity)}</div>
        <div aria-hidden />
        <Button block className="btn-remove" title="Quitar producto" onClick={() => cartActions.remove(item.productId)}>
          Quitar
        </Button>
      </Columns>
    </div>
  );
}

/**
 * "Nueva venta" (legacy ui/cashier/pos.py `pos_sale_page`). Container: owns the cart (module store), the category
 * filter, payment method / observation and the one-shot success flash; data and the sale action come from the route.
 */
export function PosScreen({ data, action }: { data: PosData; action: SaleAction }) {
  const router = useRouter();
  const cart = useCart();
  // Legacy `pos_sale_flash` is popped by the next rerun: it is visible until the cart or the category changes.
  const [flash, setFlash] = useState<{ message: string; cart: Cart; category: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("Todas");
  // Bumped after each sale so the payment / observation widgets reset (legacy `pos_sale_number` keys).
  const [saleNumber, setSaleNumber] = useState(0);
  const [pending, startTransition] = useTransition();

  const { products, paymentMethods } = data;
  const categories = useMemo(() => ["Todas", ...[...new Set(products.map(categoryOf))].sort()], [products]);
  const defaultPayment = (paymentMethods.find((m) => m.code === "MERCADO_PAGO") ?? paymentMethods[0])?.name ?? "";

  return (
    <>
      <PageHeader title="Nueva venta" subtitle="Seleccioná productos, revisá el carrito y confirmá. Los importes se calculan automáticamente." />
      {flash && flash.cart === cart && flash.category === category ? <Alert tone="success">{flash.message}</Alert> : null}
      {!data.hasOpenCash ? (
        <>
          <Alert tone="warning">Necesitás abrir tu turno antes de registrar ventas.</Alert>
          <Button block variant="secondary" onClick={() => router.push("/mi-turno")}>
            Ir a Mi turno
          </Button>
        </>
      ) : (
        <>
          <div className="quick-banner md">Flujo caja: tocar producto → ajustar cantidad si hace falta → elegir medio de pago → confirmar venta.</div>
          {products.length === 0 ? (
            <Alert tone="warning">No hay productos activos cargados.</Alert>
          ) : (
            <>
              <Field label="Categoría">
                <Select value={categories.includes(category) ? category : "Todas"} onChange={(e) => setCategory(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Columns gap="large" weights={[1.55, 1]}>
                <div className="stack">
                  <Subheader>Productos</Subheader>
                  <Columns>
                    {[0, 1, 2].map((col) => (
                      <div className="stack" key={col}>
                        {products
                          .filter((p) => category === "Todas" || categoryOf(p) === category)
                          .filter((_, idx) => idx % 3 === col)
                          .map((p) => (
                            <ProductCard key={p.id} product={p} />
                          ))}
                      </div>
                    ))}
                  </Columns>
                </div>
                <div className="stack">
                  <div className="cart-header-compact md" style={{ "--mb": "14px" } as React.CSSProperties}>
                    <div className="cart-header-title">Carrito</div>
                    <div className="cart-header-subtitle">Venta actual</div>
                  </div>
                  {cart.length === 0 ? (
                    <Alert tone="info">Todavía no agregaste productos.</Alert>
                  ) : (
                    <>
                      {cart.map((item) => (
                        <CartLine key={item.productId} item={item} />
                      ))}
                      <div className="cart-total-box md">
                        Total <strong>{formatMoneyCompact(cartTotal(cart))}</strong>
                      </div>
                      <PaymentAndConfirm
                        key={saleNumber}
                        paymentMethods={paymentMethods}
                        defaultPayment={defaultPayment}
                        pending={pending}
                        error={error}
                        onClear={() => {
                          cartActions.clear();
                          setError(null);
                        }}
                        onConfirm={(paymentMethod, notes) => {
                          setFlash(null);
                          setError(null);
                          startTransition(async () => {
                            const result = await action({ lines: toSaleLines(cart), paymentMethod, notes });
                            if (!result.ok) {
                              setError(result.message ?? "No se pudo registrar la venta.");
                              return;
                            }
                            cartActions.clear();
                            setSaleNumber((n) => n + 1);
                            setFlash({ message: result.message ?? "", cart: getCart(), category });
                          });
                        }}
                      />
                    </>
                  )}
                </div>
              </Columns>
            </>
          )}
        </>
      )}
    </>
  );
}

function PaymentAndConfirm({
  paymentMethods,
  defaultPayment,
  pending,
  error,
  onClear,
  onConfirm,
}: {
  paymentMethods: PosData["paymentMethods"];
  defaultPayment: string;
  pending: boolean;
  error: string | null;
  onClear: () => void;
  onConfirm: (paymentMethod: string, notes: string) => void;
}) {
  const [payment, setPayment] = useState(defaultPayment);
  const [notes, setNotes] = useState("");
  return (
    <>
      <Field label="Medio de pago">
        <Select value={payment} onChange={(e) => setPayment(e.target.value)}>
          {paymentMethods.map((m) => (
            <option key={m.id} value={m.name}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Observación opcional">
        <TextArea className="pos-notes" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Columns>
        <Button block variant="secondary" disabled={pending} onClick={() => onConfirm(payment, notes)}>
          Confirmar venta
        </Button>
        <Button block variant="secondary" disabled={pending} onClick={onClear}>
          Vaciar carrito
        </Button>
      </Columns>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </>
  );
}
