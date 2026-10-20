import { flag, num, str, type LegacyData } from "./legacy-reader";
import {
  groupTickets,
  legacyTimestampToIso,
  legacyUuid,
  LegacyDataError,
  mapPaymentMethod,
  mapRole,
  pesosToCents,
  productSku,
  resolveProductName,
  toDecimal,
  type LegacySaleLine,
} from "./mapping";

/** Everything the plan needs from the target that is NOT imported business data (resolved in the same transaction). */
export interface TargetRefs {
  paymentMethods: Map<string, string>; // code -> id
  units: Map<string, string>; // code -> id
  movementCategories: Map<string, string>; // exact name -> id
  productCategories: Map<string, string>; // lower(name) -> id (already existing in the target, e.g. "General")
}

export interface PlanOptions {
  importedAt: string;
}

export type Row = Record<string, string | number | boolean | null>;

export interface Plan {
  users: Row[];
  productCategories: Row[];
  suppliers: Row[];
  products: Row[];
  stockLevels: Row[];
  recipes: Row[];
  saleOrders: Row[];
  movements: Row[];
  saleOrderLines: Row[];
  /** legacy id -> new id, for the report. */
  idMap: Record<string, Record<string, string>>;
  /** Human-readable list of every skipped / altered / assumed item. */
  notes: string[];
}

const GENERAL = "General";
const KINDS = new Set(["Venta", "Gasto", "Compra", "Ajuste Stock"]);

export interface MovementCategoryPlan {
  insert: Row[];
  setActive: { id: string; active: boolean }[];
  skipped: { name: string; kind: string; reason: string }[];
}

/** Legacy `categorias` -> `movement_categories` (matched by name; the enum has no "Inventario" kind). */
export function planMovementCategories(legacy: LegacyData, existing: Map<string, string>): MovementCategoryPlan {
  const plan: MovementCategoryPlan = { insert: [], setActive: [], skipped: [] };
  for (const c of legacy.categorias) {
    const name = String(c.nombre).trim();
    const kind = String(c.tipo).trim();
    const active = flag(c.activo);
    if (kind !== "Ingreso" && kind !== "Gasto" && kind !== "Compra") {
      plan.skipped.push({ name, kind, reason: `kind "${kind}" does not exist in the new movement_category_kind enum` });
      continue;
    }
    const id = existing.get(name);
    if (id) plan.setActive.push({ id, active });
    else plan.insert.push({ id: legacyUuid("categorias", c.id as number), name, kind, active });
  }
  return plan;
}

export function buildPlan(legacy: LegacyData, refs: TargetRefs, options: PlanOptions): Plan {
  const notes: string[] = [];
  const idMap: Plan["idMap"] = { users: {}, productCategories: {}, suppliers: {}, products: {}, saleOrders: {} };

  // ---- users -------------------------------------------------------------------------------------------------------
  const userIdByName = new Map<string, string>();
  const users: Row[] = legacy.users.map((u) => {
    const username = String(u.username);
    const id = legacyUuid("users", u.id as number);
    userIdByName.set(username, id);
    idMap.users[String(u.id)] = id;
    return {
      id,
      username,
      display_name: String(u.display_name),
      role: mapRole(String(u.role)),
      is_active: flag(u.is_active),
      created_at: legacyTimestampToIso(String(u.created_at)),
    };
  });
  const userId = (username: string | null | undefined, label: string): string => {
    const id = userIdByName.get((username ?? "").trim());
    if (!id) throw new LegacyDataError(`${label}: unknown user "${username ?? ""}"`);
    return id;
  };
  const optionalUserId = (username: string | null | undefined): string | null => {
    const key = (username ?? "").trim();
    return key ? (userIdByName.get(key) ?? null) : null;
  };

  // ---- product categories (derived by the legacy migration from the free-text productos.categoria) -----------------
  const categoryIdByLower = new Map(refs.productCategories);
  const productCategories: Row[] = [];
  for (const c of legacy.categoriasProducto) {
    const name = String(c.nombre).trim();
    const existing = categoryIdByLower.get(name.toLowerCase());
    idMap.productCategories[String(c.id)] = existing ?? legacyUuid("categorias_producto", c.id as number);
    if (existing) continue;
    const id = legacyUuid("categorias_producto", c.id as number);
    categoryIdByLower.set(name.toLowerCase(), id);
    productCategories.push({
      id,
      name,
      active: flag(c.activo),
      sequence: num(c.secuencia),
      created_at: legacyTimestampToIso(String(c.created_at)),
      updated_at: c.updated_at ? legacyTimestampToIso(String(c.updated_at)) : null,
      updated_by: optionalUserId(str(c.updated_by)),
    });
  }
  const legacyCategoryName = new Map(legacy.categoriasProducto.map((c) => [c.id as number, String(c.nombre).trim()]));
  const categoryForProduct = (p: Record<string, unknown>): string => {
    const name = p.categoria_id ? legacyCategoryName.get(p.categoria_id as number) : undefined;
    if (name) {
      const id = categoryIdByLower.get(name.toLowerCase());
      if (id) return id;
    }
    let id = categoryIdByLower.get(GENERAL.toLowerCase());
    if (!id) {
      id = legacyUuid("categorias_producto", "general");
      categoryIdByLower.set(GENERAL.toLowerCase(), id);
      productCategories.push({ id, name: GENERAL, active: true, sequence: 10, created_at: options.importedAt, updated_at: null, updated_by: null });
    }
    notes.push(`product ${String(p.id)} ("${String(p.nombre ?? "")}") has no category in the legacy data -> assigned to "${GENERAL}"`);
    return id;
  };

  // ---- suppliers ---------------------------------------------------------------------------------------------------
  const suppliers: Row[] = legacy.proveedores.map((s) => {
    const id = legacyUuid("proveedores", s.id as number);
    idMap.suppliers[String(s.id)] = id;
    return {
      id,
      name: String(s.nombre).trim(),
      legal_name: str(s.razon_social) ?? "",
      tax_id: str(s.cuit) ?? "",
      business: str(s.rubro) ?? "",
      contact: str(s.contacto) ?? "",
      phone: str(s.telefono) ?? "",
      email: str(s.email) ?? "",
      address: str(s.direccion) ?? "",
      notes: str(s.notas) ?? "",
      active: flag(s.activo),
      created_at: s.created_at ? legacyTimestampToIso(String(s.created_at)) : options.importedAt,
      updated_at: s.updated_at ? legacyTimestampToIso(String(s.updated_at)) : null,
      updated_by: optionalUserId(str(s.updated_by)),
    };
  });

  // ---- products + stock --------------------------------------------------------------------------------------------
  const lastSaleName = new Map<number, string>();
  for (const m of legacy.movimientos) {
    if (m.producto_id != null && m.producto_nombre) lastSaleName.set(m.producto_id as number, String(m.producto_nombre));
  }
  const productsSorted = [...legacy.productos].sort((a, b) => (a.id as number) - (b.id as number));
  const products: Row[] = [];
  const stockLevels: Row[] = [];
  productsSorted.forEach((p, index) => {
    const legacyId = p.id as number;
    const number = index + 1;
    const id = legacyUuid("productos", legacyId);
    idMap.products[String(legacyId)] = id;
    const name = resolveProductName(str(p.nombre), legacyId, lastSaleName.get(legacyId) ?? null);
    if (name !== String(p.nombre ?? "").trim()) notes.push(`product ${legacyId}: blank legacy name replaced by "${name}"`);
    const unitCode = String(p.unidad_stock ?? "unidad").trim().toLowerCase();
    const stockUnitId = refs.units.get(unitCode);
    if (!stockUnitId) throw new LegacyDataError(`product ${legacyId}: unit "${unitCode}" does not exist in the target (run pnpm db:seed)`);
    products.push({
      id,
      number,
      name,
      sku: productSku(number),
      description: str(p.descripcion) ?? "",
      category_id: categoryForProduct(p),
      sale_price: pesosToCents(num(p.precio_venta), `product ${legacyId} precio_venta`),
      unit_cost: pesosToCents(num(p.costo_unitario), `product ${legacyId} costo_unitario`),
      min_stock: toDecimal(num(p.stock_minimo), `product ${legacyId} stock_minimo`),
      active: flag(p.activo),
      is_sellable: flag(p.es_vendible),
      is_purchasable: flag(p.es_comprable),
      is_supply: flag(p.es_insumo),
      is_compound: flag(p.es_compuesto),
      controls_stock: flag(p.controla_stock),
      stock_unit: unitCode,
      stock_unit_id: stockUnitId,
      purchase_unit: String(p.unidad_compra ?? "unidad").trim().toLowerCase(),
      purchase_factor: toDecimal(num(p.factor_compra_a_stock) > 0 ? num(p.factor_compra_a_stock) : 1, `product ${legacyId} factor_compra`),
      supplier_id: p.proveedor_id != null ? (idMap.suppliers[String(p.proveedor_id)] ?? null) : null,
      created_at: options.importedAt,
      updated_at: p.updated_at ? legacyTimestampToIso(String(p.updated_at)) : null,
      updated_by: optionalUserId(str(p.updated_by)),
    });
    const stock = toDecimal(num(p.stock_actual), `product ${legacyId} stock_actual`);
    if (stock !== 0) {
      stockLevels.push({
        product_id: id,
        quantity: stock,
        updated_at: p.updated_at ? legacyTimestampToIso(String(p.updated_at)) : options.importedAt,
        updated_by: optionalUserId(str(p.updated_by)),
      });
    }
  });

  // ---- recipes -----------------------------------------------------------------------------------------------------
  const recipes: Row[] = legacy.recetas.map((r) => {
    const sale = idMap.products[String(r.producto_venta_id)];
    const component = idMap.products[String(r.componente_id)];
    if (!sale || !component) throw new LegacyDataError(`recipe ${String(r.id)} references an unknown product`);
    return {
      id: legacyUuid("recetas_producto", r.id as number),
      sale_product_id: sale,
      component_id: component,
      quantity: toDecimal(num(r.cantidad), `recipe ${String(r.id)} cantidad`),
      unit: String(r.unidad ?? "unidad"),
      stock_quantity: toDecimal(num(r.cantidad_stock ?? r.cantidad), `recipe ${String(r.id)} cantidad_stock`),
      created_at: legacyTimestampToIso(String(r.created_at)),
      created_by: userId(str(r.created_by), `recipe ${String(r.id)} created_by`),
    };
  });

  // ---- sale orders (grouped by ticket) + movements + lines ------------------------------------------------------
  const saleLines: LegacySaleLine[] = legacy.movimientos
    .filter((m) => m.tipo === "Venta" && str(m.ticket_id)?.trim())
    .map((m) => ({
      id: m.id as number,
      ticketId: String(m.ticket_id).trim(),
      fecha: String(m.fecha),
      createdBy: str(m.created_by),
      createdAt: String(m.created_at),
      medioPago: str(m.medio_pago),
      observacion: str(m.observacion),
      importeCents: pesosToCents(num(m.importe), `movement ${String(m.id)} importe`),
      anulada: flag(m.anulada),
      anuladaAt: str(m.anulada_at),
      anuladaPor: str(m.anulada_por),
      motivoAnulacion: str(m.motivo_anulacion),
    }));
  const tickets = groupTickets(saleLines);
  const orderIdByTicket = new Map<string, string>();
  const saleOrders: Row[] = tickets.map((t) => {
    const id = legacyUuid("ordenes_venta", t.ticketId);
    orderIdByTicket.set(t.ticketId, id);
    idMap.saleOrders[t.ticketId] = id;
    if (t.mixedPayment) notes.push(`ticket ${t.ticketId}: lines mix payment methods; order uses "${t.paymentMethodName}" (legacy MIN rule)`);
    const method = mapPaymentMethod(t.paymentMethodName);
    return {
      id,
      ticket_id: t.ticketId,
      business_date: t.businessDate,
      cash_session_id: null,
      status: t.status,
      payment_method_id: method ? (refs.paymentMethods.get(method.code) ?? null) : null,
      total: t.total,
      notes: t.notes,
      created_by: userId(t.createdBy, `ticket ${t.ticketId} created_by`),
      created_at: legacyTimestampToIso(t.createdAt),
      voided_at: t.voidedAt ? legacyTimestampToIso(t.voidedAt) : null,
      voided_by: t.voidedBy ? userId(t.voidedBy, `ticket ${t.ticketId} voided_by`) : null,
      void_reason: t.voidReason,
    };
  });

  const movementIdByLegacy = new Map<number, string>();
  const movements: Row[] = legacy.movimientos.map((m) => {
    const legacyId = m.id as number;
    const kind = String(m.tipo);
    if (!KINDS.has(kind)) throw new LegacyDataError(`movement ${legacyId}: unknown tipo "${kind}"`);
    const id = legacyUuid("movimientos", legacyId);
    movementIdByLegacy.set(legacyId, id);
    const method = mapPaymentMethod(str(m.medio_pago));
    const ticket = str(m.ticket_id)?.trim() || null;
    const voided = flag(m.anulada);
    const category = str(m.categoria);
    const productName = str(m.producto_nombre);
    return {
      id,
      number: legacyId,
      business_date: String(m.fecha),
      kind,
      category,
      category_id: category ? (refs.movementCategories.get(category.trim()) ?? null) : null,
      description: String(m.descripcion),
      product_id: m.producto_id != null ? (idMap.products[String(m.producto_id)] ?? null) : null,
      product_name: productName,
      quantity: toDecimal(num(m.cantidad), `movement ${legacyId} cantidad`),
      unit_price: pesosToCents(num(m.precio_unitario), `movement ${legacyId} precio_unitario`),
      amount: pesosToCents(num(m.importe), `movement ${legacyId} importe`),
      payment_method_id: method ? (refs.paymentMethods.get(method.code) ?? null) : null,
      payment_method_name: method?.name ?? null,
      supplier_id: m.proveedor_id != null ? (idMap.suppliers[String(m.proveedor_id)] ?? null) : null,
      supplier_name: str(m.proveedor) ?? "",
      notes: str(m.observacion) ?? "",
      created_by: userId(str(m.created_by), `movement ${legacyId} created_by`),
      created_at: legacyTimestampToIso(String(m.created_at)),
      voided,
      void_reason: voided ? str(m.motivo_anulacion) : null,
      voided_by: voided ? userId(str(m.anulada_por), `movement ${legacyId} voided_by`) : null,
      voided_at: voided && m.anulada_at ? legacyTimestampToIso(String(m.anulada_at)) : null,
      ticket_id: ticket,
      cash_session_id: null,
      sale_order_id: kind === "Venta" && ticket ? (orderIdByTicket.get(ticket) ?? null) : null,
    };
  });

  const saleOrderLines: Row[] = [];
  const movById = new Map(legacy.movimientos.map((m) => [m.id as number, m]));
  for (const t of tickets) {
    t.lineIds.forEach((lineId, i) => {
      const m = movById.get(lineId)!;
      saleOrderLines.push({
        id: legacyUuid("lineas_orden_venta", lineId),
        order_id: orderIdByTicket.get(t.ticketId)!,
        sequence: (i + 1) * 10,
        product_id: m.producto_id != null ? (idMap.products[String(m.producto_id)] ?? null) : null,
        product_name: str(m.producto_nombre) ?? str(m.descripcion) ?? "Producto",
        quantity: Math.max(toDecimal(num(m.cantidad), `line ${lineId} cantidad`), 1e-9),
        unit_price: pesosToCents(num(m.precio_unitario), `line ${lineId} precio_unitario`),
        subtotal: pesosToCents(num(m.importe), `line ${lineId} importe`),
        movement_id: movementIdByLegacy.get(lineId)!,
      });
    });
  }

  return { users, productCategories, suppliers, products, stockLevels, recipes, saleOrders, movements, saleOrderLines, idMap, notes };
}
