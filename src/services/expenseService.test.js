import assert from "node:assert/strict";
import test from "node:test";
import { calculateExpenseSplit } from "./expenseService.js";

const members = [
  { id: "a", name: "Ansu" },
  { id: "b", name: "Rahul" },
  { id: "c", name: "Priya" }
];

test("splits equal item shares fairly to the paise", () => {
  const result = calculateExpenseSplit({
    members,
    items: [{
      id: "fruit",
      name: "Fruit",
      quantity: 1,
      price: 10,
      consumers: members.map((member) => member.id)
    }]
  });

  assert.deepEqual(result.memberTotals.map(({ amount }) => amount), [3.34, 3.33, 3.33]);
  assert.equal(result.memberTotals.reduce((sum, member) => sum + member.amount, 0), 10);
});

test("applies printed tax and a signed receipt adjustment using the selected allocation", () => {
  const result = calculateExpenseSplit({
    members,
    items: [{
      id: "cart",
      name: "Grocery cart",
      quantity: 1,
      price: 1293.6,
      consumers: members.map((member) => member.id)
    }],
    additionalFees: 64.68,
    roundingAdjustment: -0.28,
    feesAllocation: "equal",
    adjustmentAllocation: "equal"
  });

  assert.equal(result.subtotal, 1293.6);
  assert.equal(result.additionalFees, 64.68);
  assert.equal(result.roundingAdjustment, -0.28);
  assert.equal(result.grandTotal, 1358);
  assert.deepEqual(result.memberTotals.map(({ amount }) => amount), [452.66, 452.67, 452.67]);
  assert.equal(result.memberTotals.reduce((sum, member) => sum + member.amount, 0), 1358);
});

test("allocates tax only among item consumers when proportional allocation is selected", () => {
  const result = calculateExpenseSplit({
    members,
    items: [
      { id: "rice", name: "Rice", quantity: 1, price: 9, consumers: ["a"] },
      { id: "milk", name: "Milk", quantity: 1, price: 1, consumers: ["b"] }
    ],
    additionalFees: 1
  });

  assert.deepEqual(result.memberTotals.map(({ amount }) => amount), [9.9, 1.1, 0]);
  assert.equal(result.memberTotals.reduce((sum, member) => sum + member.amount, 0), 11);
});

test("rejects missing members, prices, and unassigned items with useful errors", () => {
  assert.throws(
    () => calculateExpenseSplit({
      members: [],
      items: [{ id: "milk", name: "Milk", quantity: 1, price: 1, consumers: [] }]
    }),
    /Add at least one household member/
  );
  assert.throws(
    () => calculateExpenseSplit({
      members,
      items: [{ id: "milk", name: "Milk", quantity: 1, consumers: ["a"] }]
    }),
    /positive price/
  );
  assert.throws(
    () => calculateExpenseSplit({
      members,
      items: [{ id: "milk", name: "Milk", quantity: 1, price: 1, consumers: [] }]
    }),
    /Each item needs valid consumers/
  );
});

test("rejects adjustments that would produce a negative member or bill share", () => {
  assert.throws(
    () => calculateExpenseSplit({
      members,
      items: [{ id: "milk", name: "Milk", quantity: 1, price: 1, consumers: ["a"] }],
      roundingAdjustment: -2
    }),
    /adjustment is too large/
  );
});
