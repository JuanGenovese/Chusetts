"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Alert, Dialog, ToastHost, useToast } from "@/shared/ui";
import { ProductCatalog } from "./product-catalog";
import { ProductDetail } from "./product-detail";
import { FlashContext } from "./product-flash";
import { ProductForm } from "./product-form";
import type { ProductsActions, ProductsData } from "./products-types";

function ProductsBody({ data, actions }: { data: ProductsData; actions: ProductsActions }) {
  const router = useRouter();
  const toast = useToast();
  const [flash, setFlash] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const show = useCallback(
    (message: string) => {
      setFlash(message);
      toast(message, "✅");
    },
    [toast],
  );
  const clear = useCallback(() => setFlash(null), []);
  const api = useMemo(() => ({ show, clear }), [show, clear]);
  const open = (id: string | null) => {
    clear();
    router.push(id ? `/productos?producto=${id}` : "/productos");
  };

  return (
    <FlashContext.Provider value={api}>
      {flash ? <Alert tone="success">{flash}</Alert> : null}
      {data.detail ? (
        <ProductDetail key={data.detail.product.id} detail={data.detail} actions={actions} onBack={() => open(null)} />
      ) : (
        <ProductCatalog products={data.products} onNewProduct={() => setCreating(true)} onOpen={open} />
      )}
      {creating ? (
        <Dialog title="Nuevo producto" onClose={() => setCreating(false)}>
          <ProductForm
            options={data.formOptions}
            action={actions.create}
            onCreated={(result) => {
              show(result.message ?? "Producto creado correctamente.");
              if (result.productId) router.push(`/productos?producto=${result.productId}`);
            }}
          />
        </Dialog>
      ) : null}
    </FlashContext.Provider>
  );
}

/**
 * "Productos e inventario" (legacy ui/admin/products): catalog grid, "Nuevo producto" dialog and the product detail
 * page. The legacy keeps the open product in session state; here it is the `?producto=` URL parameter, so the browser
 * back button and a reload keep working. Data and Server Actions come from the route.
 */
export function ProductsScreen({ data, actions }: { data: ProductsData; actions: ProductsActions }) {
  return (
    <ToastHost>
      <ProductsBody data={data} actions={actions} />
    </ToastHost>
  );
}
