
function allocateProportionally(totalCents, entries) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new Error("Invalid allocation amount");
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    if (totalCents === 0) return [];
    throw new Error("No members available for allocation");
  }

  const totalBasis = entries.reduce((sum, entry) => {
    if (!Number.isSafeInteger(entry.basis) || entry.basis <= 0) {
      throw new Error("Allocation basis must be a positive amount");
    }
    return sum + entry.basis;
  }, 0);

  if (!Number.isSafeInteger(totalBasis) || totalBasis <= 0) {
    throw new Error("Invalid total allocation basis");
  }

  const shares = entries.map((entry) => {
    const exact = (totalCents * entry.basis) / totalBasis;
    const cents = Math.floor(exact);

    return {
      id: entry.id,
      cents,
      remainder: exact - cents
    };
  });

  let remaining =
    totalCents - shares.reduce((sum, share) => sum + share.cents, 0);

  const ranked = [...shares].sort(
    (a, b) => b.remainder - a.remainder
  );

  for (let i = 0; i < remaining; i++) {
    ranked[i].cents += 1;
  }

  return shares.map(({ id, cents }) => ({ id, cents }));
}

function allocateEvenly(totalCents, ids) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new Error("Invalid allocation amount");
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    if (totalCents === 0) return [];
    throw new Error("No consumers available for allocation");
  }

  const baseCents = Math.floor(totalCents / ids.length);
  const remainder = totalCents % ids.length;
  return ids.map((id, index) => ({
    id,
    cents: baseCents + (index < remainder ? 1 : 0)
  }));
}

export function calculateExpenseSplit({
  members,
  items,
  discount = 0,
  additionalFees = 0
}) {
  if (!Array.isArray(members) || !Array.isArray(items)) {
    throw new Error("Members and items must be arrays");
  }

  // Validate members
  const memberIds = new Set(members.map((member) => member.id));

  if (
    members.some((member) => !member.id || !member.name?.trim()) ||
    memberIds.size !== members.length
  ) {
    throw new Error("Invalid or duplicate household members");
  }

  // Convert discount and fees to paise
  const discountCents = Math.round(Number(discount) * 100);
  const feeCents = Math.round(Number(additionalFees) * 100);

  if (
    !Number.isSafeInteger(discountCents) ||
    !Number.isSafeInteger(feeCents) ||
    discountCents < 0 ||
    feeCents < 0
  ) {
    throw new Error("Invalid discount or additional fees");
  }

  // Handle empty cart
  if (items.length === 0) {
    if (discountCents > 0) {
      throw new Error("Discount cannot exceed the cart subtotal");
    }

    return {
      subtotal: 0,
      discount: 0,
      additionalFees: feeCents / 100,
      grandTotal: feeCents / 100,
      memberTotals: members.map((member) => ({
        id: member.id,
        name: member.name,
        amount: 0
      })),
      itemAllocations: []
    };
  }

  if (members.length === 0) {
    throw new Error("Add at least one household member");
  }

  const memberTotals = Object.fromEntries(
    members.map((member) => [member.id, 0])
  );

  const itemAllocations = [];
  let subtotalCents = 0;

  // Allocate each grocery item
  for (const item of items) {
    const priceCents = Math.round(Number(item.price) * 100);
    const quantity = Number(item.quantity);
    const hasLineTotal = item.lineTotal !== null &&
      item.lineTotal !== undefined &&
      Number.isFinite(Number(item.lineTotal));

    if (
      (!hasLineTotal && (!Number.isSafeInteger(priceCents) || priceCents <= 0)) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1
    ) {
      throw new Error("Invalid item price or quantity");
    }

    const consumers = item.consumers || [];

    if (
      !Array.isArray(consumers) ||
      consumers.length === 0 ||
      new Set(consumers).size !== consumers.length ||
      consumers.some((id) => !memberIds.has(id))
    ) {
      throw new Error("Each item needs valid consumers");
    }

    const itemTotal = hasLineTotal
      ? Math.round(Number(item.lineTotal) * 100)
      : priceCents * quantity;

    if (!Number.isSafeInteger(itemTotal) || itemTotal <= 0) {
      throw new Error("Item total is too large");
    }

    subtotalCents += itemTotal;

    if (!Number.isSafeInteger(subtotalCents)) {
      throw new Error("Cart subtotal is too large");
    }

    const allocations = allocateEvenly(itemTotal, consumers);

    allocations.forEach((allocation) => {
      memberTotals[allocation.id] += allocation.cents;

      if (!Number.isSafeInteger(memberTotals[allocation.id])) {
        throw new Error("Member total is too large");
      }
    });

    itemAllocations.push({
      itemId: item.id,
      name: item.name,
      total: itemTotal,
      allocations
    });
  }

  // Validate discount against subtotal
  if (discountCents > subtotalCents) {
    throw new Error("Discount cannot exceed the cart subtotal");
  }

  const netSubtotal = subtotalCents - discountCents;

  // Allocate discounted subtotal proportionally
  const eligibleMembers = members
    .map((member) => ({
      id: member.id,
      basis: memberTotals[member.id]
    }))
    .filter((entry) => entry.basis > 0);

  const netAllocations =
    netSubtotal === 0
      ? eligibleMembers.map((entry) => ({
          id: entry.id,
          cents: 0
        }))
      : allocateProportionally(
          netSubtotal,
          eligibleMembers.map((entry) => ({
            id: entry.id,
            basis: memberTotals[entry.id]
          }))
        );

  // Allocate additional fees proportionally
  const feeAllocations =
    feeCents === 0
      ? netAllocations.map((entry) => ({
          id: entry.id,
          cents: 0
        }))
      : allocateProportionally(
          feeCents,
          netAllocations
            .filter((entry) => entry.cents > 0)
            .map((entry) => ({
              id: entry.id,
              basis: entry.cents
            }))
        );

  // Calculate final member payments
  const finalTotals = Object.fromEntries(
    members.map((member) => [member.id, 0])
  );

  netAllocations.forEach((entry) => {
    finalTotals[entry.id] += entry.cents;
  });

  feeAllocations.forEach((entry) => {
    finalTotals[entry.id] += entry.cents;
  });

  const grandTotalCents = netSubtotal + feeCents;

  const allocatedTotal = Object.values(finalTotals).reduce(
    (sum, amount) => sum + amount,
    0
  );

  if (allocatedTotal !== grandTotalCents) {
    throw new Error("Bill allocation reconciliation failed");
  }

  return {
    subtotal: subtotalCents / 100,
    discount: discountCents / 100,
    additionalFees: feeCents / 100,
    grandTotal: grandTotalCents / 100,

    memberTotals: members.map((member) => ({
      id: member.id,
      name: member.name,
      amount: finalTotals[member.id] / 100
    })),

    itemAllocations: itemAllocations.map((item) => ({
      ...item,
      total: item.total / 100,
      allocations: item.allocations.map((allocation) => ({
        id: allocation.id,
        amount: allocation.cents / 100
      }))
    }))
  };
}
