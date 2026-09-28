import { Strategy, type Product } from "../types";
import { productBrief, STRATEGY_SYSTEM } from "./prompts";
import { generateStructured } from "./structured";

/** Turns the product brief into a go-to-market strategy. */
export function generateStrategy(product: Product, signal?: AbortSignal): Promise<Strategy> {
  return generateStructured({
    schema: Strategy,
    system: STRATEGY_SYSTEM,
    prompt: `${productBrief(product)}\n\nCreate the go-to-market strategy for this product.`,
    signal,
  });
}
