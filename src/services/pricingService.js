
import { baselines } from "../data/baselines";
import { products } from "../data/products";

// Calculate percentage variation from baseline.
export function calculatePriceVariance(currentPrice, baselinePrice) {
  if (
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(baselinePrice) ||
    currentPrice < 0 ||
    baselinePrice <= 0
  ) {
    return null;
  }

  return ((currentPrice - baselinePrice) / baselinePrice) * 100;
}

// Determine the price alert status.
export function getPriceStatus(variance) {
  if (variance === null || !Number.isFinite(variance)) {
    return "Unknown";
  }

  if (variance <= 0) {
    return "Good";
  }

  if (variance <= 10) {
    return "Moderate";
  }

  return "High";
}

// Generate store-wise price comparisons.
export function getAllPriceComparisons() {
  return products.flatMap((product) => {
    const baseline = baselines.find(
      (item) => item.productId === product.id
    );

    if (!baseline) return [];

    return product.stores.map((store) => {
      const variance = calculatePriceVariance(
        store.price,
        baseline.baselinePrice
      );

      return {
        productId: product.id,
        productName: product.name,
        category: product.category,
        brand: product.brand,
        quantity: product.quantity,
        storeName: store.name,
        currentPrice: store.price,
        baselinePrice: baseline.baselinePrice,
        variance,
        status: getPriceStatus(variance),
        lastUpdated: baseline.lastUpdated
      };
    });
  });
}

// Get color classes for alerts.
export function getStatusStyles(status) {
  switch (status) {
    case "Good":
      return "bg-green-50 text-green-700 border-green-200";

    case "Moderate":
      return "bg-yellow-50 text-yellow-700 border-yellow-200";

    case "High":
      return "bg-red-50 text-red-700 border-red-200";

    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}
