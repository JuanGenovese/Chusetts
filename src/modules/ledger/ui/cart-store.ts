import { useSyncExternalStore } from "react";
import { addToCart, removeFromCart, type Cart, type CartProduct } from "./cart";

/**
 * The cart lives in a module-level store: like the legacy `st.session_state['cart']` it survives navigation between
 * pages (client-side route changes keep the module) and is lost on a full reload, exactly as a new Streamlit session.
 */
const EMPTY: Cart = [];
let cart: Cart = EMPTY;
const listeners = new Set<() => void>();

function set(next: Cart) {
  cart = next;
  for (const listener of listeners) listener();
}

export const cartActions = {
  add: (product: CartProduct) => set(addToCart(cart, product)),
  remove: (productId: string) => set(removeFromCart(cart, productId)),
  clear: () => set(EMPTY),
};

export const getCart = (): Cart => cart;

export function useCart(): Cart {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => cart,
    () => EMPTY,
  );
}
