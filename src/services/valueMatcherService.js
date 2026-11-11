
import { alternatives } from "../data/alternatives";

// Convert quantities into standard units.
export function getStandardQuantity(product) {
  if (product.unit === "g") {
    return product.quantity / 1000;
  }

  if (product.unit === "ml") {
    return product.quantity / 1000;
  }

  return product.quantity;
}

// Calculate price per kg or litre.
export function calculateUnitPrice(product) {
  const standardQuantity = getStandardQuantity(product);

  if (standardQuantity <= 0) {
    throw new Error("Invalid product quantity");
  }

  return product.price / standardQuantity;
}

// Get alternative brands for a product.
export function getAlternatives(productType) {
  return alternatives.filter(
    (item) => item.product === productType
  );
}

// Sort products by unit price.
export function rankByValue(productType) {
  return getAlternatives(productType)
    .map((item) => ({
      ...item,
      unitPrice: calculateUnitPrice(item)
    }))
    .sort((a, b) => a.unitPrice - b.unitPrice);
}

// Calculate potential savings against a reference brand.
export function calculateSavings(reference, alternative) {
  const referencePrice = calculateUnitPrice(reference);
  const alternativePrice = calculateUnitPrice(alternative);

  return {
    amount: referencePrice - alternativePrice,
    percentage:
      referencePrice > 0
        ? ((referencePrice - alternativePrice) / referencePrice) * 100
        : 0
  };
}
