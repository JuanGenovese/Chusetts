import { describe, expect, it } from "vitest";
import { addToCart, cartTotal, lineSubtotal, removeFromCart, toSaleLines, type CartProduct } from "./cart";

const beer: CartProduct = { id: "p1", name: "Pinta IPA", category: "Cerveza tirada", price: 450000 };
const water: CartProduct = { id: "p2", name: "Agua mineral", category: "", price: 180000 };

describe("cart (legacy services/cart_service.py)", () => {
  it("adds a new product with quantity 1", () => {
    expect(addToCart([], beer)).toEqual([{ productId: "p1", name: "Pinta IPA", category: "Cerveza tirada", unitPrice: 450000, quantity: 1 }]);
  });

  it("adding an existing product increments its quantity and keeps insertion order", () => {
    const cart = addToCart(addToCart(addToCart([], beer), water), beer);
    expect(cart.map((i) => [i.productId, i.quantity])).toEqual([["p1", 2], ["p2", 1]]);
  });

  it("does not mutate the previous cart", () => {
    const before = addToCart([], beer);
    addToCart(before, beer);
    expect(before[0].quantity).toBe(1);
  });

  it("removes a line entirely (Quitar)", () => {
    const cart = addToCart(addToCart(addToCart([], beer), beer), water);
    expect(removeFromCart(cart, "p1").map((i) => i.productId)).toEqual(["p2"]);
    expect(removeFromCart(cart, "zzz")).toEqual(cart);
  });

  it("computes line subtotal and total in cents", () => {
    const cart = addToCart(addToCart(addToCart([], beer), beer), water);
    expect(lineSubtotal(cart[0])).toBe(900000);
    expect(cartTotal(cart)).toBe(1080000);
    expect(cartTotal([])).toBe(0);
  });

  it("maps the cart to the sale lines the server action receives (ids and quantities only)", () => {
    const cart = addToCart(addToCart([], beer), beer);
    expect(toSaleLines(cart)).toEqual([{ productId: "p1", quantity: 2 }]);
  });
});
