
import { formatCurrency } from "./appLocale";

export function calculateStoreTotal(store, quantity = 1) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Quantity must be a positive integer");
  }

  return (
    store.price * quantity +
    store.deliveryFee +
    store.platformFee
  );
}

export function compareStores(product, quantity = 1) {
  if (!product || !Array.isArray(product.stores)) {
    return [];
  }

  return product.stores
    .map((store) => ({
      ...store,
      total: calculateStoreTotal(store, quantity)
    }))
    .sort((a, b) => a.total - b.total);
}

export function calculateSavings(comparisons) {
  if (!comparisons || comparisons.length < 2) {
    return 0;
  }

  const totals = comparisons.map((store) => store.total);

  return Math.max(...totals) - Math.min(...totals);
}

export function formatPrice(amount) {
  return formatCurrency(amount);
}
