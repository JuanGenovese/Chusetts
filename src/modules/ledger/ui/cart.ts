import type { Cents } from "@/shared/domain/money";

/** A product as the POS grid shows it (price from the catalog, in cents). */
export interface CartProduct {
  id: string;
  name: string;
  category: string;
  price: Cents;
}

export interface CartItem {
  productId: string;
  name: string;
  category: string;
  unitPrice: Cents;
  quantity: number;
}

/** Ordered by first addition, like the legacy `st.session_state['cart']` dict. */
export type Cart = readonly CartItem[];

/** Legacy `add_to_cart(product, 1)`. */
export function addToCart(cart: Cart, product: CartProduct): Cart {
  if (cart.some((item) => item.productId === product.id)) {
    return cart.map((item) => (item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item));
  }
  return [...cart, { productId: product.id, name: product.name, category: product.category, unitPrice: product.price, quantity: 1 }];
}

/** "Quitar": drops the whole line. */
export function removeFromCart(cart: Cart, productId: string): Cart {
  return cart.filter((item) => item.productId !== productId);
}

export const lineSubtotal = (item: CartItem): Cents => item.quantity * item.unitPrice;

/** Legacy `cart_total()`. */
export const cartTotal = (cart: Cart): Cents => cart.reduce((sum, item) => sum + lineSubtotal(item), 0);

/** The server re-reads prices: only ids and quantities travel. */
export const toSaleLines = (cart: Cart): { productId: string; quantity: number }[] =>
  cart.map((item) => ({ productId: item.productId, quantity: item.quantity }));
