import { addTransaction } from "../services/spendingLedger";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAppSettings } from "../services/AppSettingsContext";
import { formatCurrency, fromBaseCurrency, toBaseCurrency, translate } from "../services/appLocale";

import {
  Users,
  Plus,
  Trash2,
  ShoppingCart,
  Receipt,
  Wallet,
  UserPlus,
  Minus,
  IndianRupee
} from "lucide-react";

import { calculateExpenseSplit } from "../services/expenseService";
import BillScanner from "../components/BillScanner";

const initialMembers = [
  { id: "a", name: "Ansu" },
  { id: "b", name: "Rahul" },
  { id: "c", name: "Priya" }
];

const initialItems = [
  {
    id: 1,
    name: "Milk",
    price: 60,
    quantity: 1,
    consumers: ["a", "b", "c"]
  },
  {
    id: 2,
    name: "Bread",
    price: 40,
    quantity: 1,
    consumers: ["a", "b"]
  },
  {
    id: 3,
    name: "Chips",
    price: 30,
    quantity: 1,
    consumers: ["a"]
  }
];

const money = (value) => formatCurrency(value);

const STORAGE_KEY = "cartsync-expense-data";

function loadExpenseData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;

    const data = JSON.parse(saved);

    if (
      !data ||
      !Array.isArray(data.members) ||
      !Array.isArray(data.items) ||
      data.members.some(
        (member) =>
          !member ||
          typeof member.id !== "string" ||
          typeof member.name !== "string"
      ) ||
      data.items.some(
        (item) =>
          !item ||
          !Array.isArray(item.consumers) ||
          typeof item.name !== "string"
      )
    ) {
      return null;
    }

    return {
      ...data,
      items: data.items.map((item) =>
        Object.fromEntries(
          Object.entries(item).filter(([key]) => key !== "weights")
        )
      )
    };
  } catch (error) {
    console.error("Unable to load CartSync expense data:", error);
    return null;
  }
}

export default function ExpenseSplitter() {
  const { settings } = useAppSettings();
  const t = (text) => translate(text, settings.language);
  const [savedData] = useState(() => loadExpenseData());
  const [members, setMembers] = useState(
    () => savedData?.members ?? initialMembers
  );
  const [items, setItems] = useState(
    () => savedData?.items ?? initialItems
  );

  const [memberName, setMemberName] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemQuantity, setItemQuantity] = useState("1");

  const [discount, setDiscount] = useState(
    () => savedData?.discount ?? "0"
  );
  const [additionalFees, setAdditionalFees] = useState(
    () => savedData?.additionalFees ?? "0"
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    if (success) toast.success(success);
  }, [success]);

  // Save household and bill data whenever it changes.
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          members,
          items,
          discount,
          additionalFees
        })
      );
    } catch (storageError) {
      console.error("Unable to save CartSync expense data:", storageError);
      setError("Unable to save data in this browser. Check browser storage settings.");
    }
  }, [members, items, discount, additionalFees]);

  // Calculate the expense split
  const result = useMemo(() => {
    try {
      return {
        data: calculateExpenseSplit({
          members,
          items,
          discount: Number(discount),
          additionalFees: Number(additionalFees)
        }),
        error: ""
      };
    } catch (err) {
      return {
        data: null,
        error: err.message
      };
    }
  }, [members, items, discount, additionalFees]);

  // Add household member
  const addMember = () => {
    const name = memberName.trim();

    if (!name) {
      setError("Enter a member name.");
      return;
    }

    if (
      members.some(
        (member) => member.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      setError("This member already exists.");
      return;
    }

    setMembers((old) => [
      ...old,
      {
        id: crypto.randomUUID(),
        name
      }
    ]);

    setMemberName("");
    setError("");
  };

  const addScannedItems = (scannedItems, adjustments) => {
    if (
      items.length > 0 &&
      !window.confirm("Replace the current cart with the reviewed scanned bill?")
    ) {
      return false;
    }

    const newItems = scannedItems.map((item) => ({
      id: crypto.randomUUID(),
      ...item
    }));

    setItems(newItems);
    setDiscount(String(adjustments.discount));
    setAdditionalFees(String(adjustments.additionalFees));
    setError("");
    setSuccess(`${newItems.length} reviewed bill items added to the split.`);
    return true;
  };

  // Remove member and their item assignments.
  const removeMember = (id) => {
    if (members.length <= 1) {
      setError("At least one member is required.");
      return;
    }

    setMembers((old) => old.filter((member) => member.id !== id));

    setItems((old) => old.map((item) => ({
      ...item,
      consumers: item.consumers.filter((consumer) => consumer !== id)
    })));

    setError("");
  };

  // Add grocery item
  const addItem = () => {
    const name = itemName.trim();
    const price = Number(itemPrice);
    const quantity = Number(itemQuantity);

    if (
      !name ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      setError("Enter a valid item name, price and quantity.");
      return;
    }

    if (members.length === 0) {
      setError("Add a household member first.");
      return;
    }

    const defaultConsumer = members[0].id;

    setItems((old) => [
      ...old,
      {
        id: crypto.randomUUID(),
        name,
        price,
        quantity,
        consumers: [defaultConsumer]
      }
    ]);

    setItemName("");
    setItemPrice("");
    setItemQuantity("1");
    setError("");
  };

  // Select or deselect an item's consumer
  const toggleConsumer = (itemId, memberId) => {
    setItems((old) =>
      old.map((item) => {
        if (item.id !== itemId) return item;

        const selected = item.consumers.includes(memberId);

        return {
          ...item,
          consumers: selected
            ? item.consumers.filter((id) => id !== memberId)
            : [...item.consumers, memberId]
        };
      })
    );

    setError("");
  };

  // Update item quantity
  const updateQuantity = (itemId, change) => {
    setItems((old) =>
      old.map((item) =>
        item.id === itemId
          ? {
              ...item,
              quantity: Math.max(1, item.quantity + change),
              lineTotal: undefined
            }
          : item
      )
    );
  };

  // Remove grocery item
  const removeItem = (id) => {
    setItems((old) => old.filter((item) => item.id !== id));
    setError("");
  };

  // Clear cart and reset bill adjustments
  const clearCart = () => {
    setItems([]);
    setDiscount("0");
    setAdditionalFees("0");
    setError("");
    setSuccess("");
  };

  // Record the bill as an actual purchase in the shared spending ledger.
  const completePurchase = () => {
    if (!split || items.length === 0) {
      setError("Add at least one valid grocery item before confirming a purchase.");
      setSuccess("");
      return;
    }

    if (items.some((item) => !item.consumers || item.consumers.length === 0)) {
      setError("Select at least one consumer for every grocery item.");
      setSuccess("");
      return;
    }

    if (!Number.isFinite(Number(split.grandTotal)) || Number(split.grandTotal) <= 0) {
      setError("The final bill must be greater than zero.");
      setSuccess("");
      return;
    }

    const confirmed = window.confirm(
      `Confirm this grocery purchase for ${money(split.grandTotal)}? It will be added to Budget Management.`
    );

    if (!confirmed) return;

    try {
      addTransaction({
        name: `Grocery purchase (${items.length} items)`,
        amount: split.grandTotal,
        category: "Groceries",
        source: "expense-splitter",
        items: items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: Number(item.price),
          total: item.lineTotal ?? Number(item.price) * Number(item.quantity),
          consumers: [...item.consumers],
        })),
        memberAllocations: split.memberTotals.map((member) => ({
          memberId: member.id,
          memberName: member.name,
          amount: member.amount,
        })),
      });

      setItems([]);
      setDiscount("0");
      setAdditionalFees("0");
      setError("");
      setSuccess(
        `Purchase recorded successfully: ${money(split.grandTotal)}. Budget Management will update automatically.`
      );
    } catch (purchaseError) {
      setError(purchaseError.message || "Unable to record this purchase.");
      setSuccess("");
    }
  };

  const split = result.data;

  return (
    <div className="space-y-6">

      {/* Heading */}
      <div>
        <p className="text-sm font-medium text-teal-700">
          CARTSYNC ANALYTICS / EXPENSE MANAGEMENT
        </p>

        <h1 className="text-3xl font-bold text-slate-800 mt-2">
          {t("Roommate Expense Splitter")}
        </h1>

        <p className="text-slate-500 mt-2">
          Split each item equally among the selected friends or household members.
        </p>
      </div>

      {/* Household Members */}
      <section className="bg-white border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="text-teal-700" />
          <h2 className="text-lg font-bold">
            {t("Household Members")}
          </h2>
        </div>

        <div className="flex flex-wrap gap-3">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-2 bg-teal-50 text-teal-800 px-4 py-2 rounded-full"
            >
              <span className="text-sm font-medium">
                {member.name}
              </span>

              <button
                aria-label={`Remove ${member.name}`}
                onClick={() => removeMember(member.id)}
                className="hover:text-red-600"
              >
                <Minus size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mt-5">
          <input
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && addMember()
            }
            placeholder={t("Enter member name")}
            className="border rounded-xl px-4 py-3 outline-none flex-1 min-w-40"
          />

          <button
            onClick={addMember}
            className="bg-teal-700 text-white rounded-xl px-5 py-3 flex items-center gap-2"
          >
            <UserPlus size={18} />
            {t("Add Member")}
          </button>
        </div>
      </section>

      <BillScanner
        members={members}
        settings={settings}
        onAddItems={addScannedItems}
      />

      {/* Add Grocery */}
      <section className="bg-white border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart className="text-teal-700" />
          <h2 className="text-lg font-bold">
            {t("Add Grocery Item")}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder={t("Product name")}
            className="border rounded-xl p-3 outline-none"
          />

          <input
            type="number"
            min="0.01"
            step="0.01"
            value={itemPrice === "" ? "" : fromBaseCurrency(itemPrice, settings)}
            onChange={(e) => setItemPrice(e.target.value === "" ? "" : String(toBaseCurrency(e.target.value, settings)))}
            placeholder={`${t("Price")} (${settings.currency})`}
            className="border rounded-xl p-3 outline-none"
          />

          <input
            type="number"
            min="1"
            step="1"
            value={itemQuantity}
            onChange={(e) => setItemQuantity(e.target.value)}
            placeholder={t("Quantity")}
            className="border rounded-xl p-3 outline-none"
          />
        </div>

        <button
          onClick={addItem}
          className="mt-4 bg-teal-700 text-white px-5 py-3 rounded-xl flex items-center gap-2"
        >
          <Plus size={18} />
            {t("Add to Cart")}
        </button>
      </section>

      {/* Shopping Cart */}
      <section className="bg-white border rounded-2xl p-5">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold">
            Shopping Cart ({items.length})
          </h2>

          <button
            onClick={clearCart}
            className="text-sm text-red-600 hover:underline"
          >
            Clear Cart
          </button>
        </div>

        {items.length === 0 ? (
          <p className="text-center text-slate-500 py-8">
            Your shopping cart is empty.
          </p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="border rounded-xl p-4"
              >
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-semibold">
                      {item.name}
                    </h3>

                    <p className="text-sm text-slate-500 mt-1">
                      {item.quantity} × {money(item.price)} =
                      {" "}{money(item.lineTotal ?? item.price * item.quantity)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      aria-label={`Decrease ${item.name} quantity`}
                      onClick={() => updateQuantity(item.id, -1)}
                      className="border p-2 rounded-lg"
                    >
                      <Minus size={15} />
                    </button>

                    <span className="font-semibold">
                      {item.quantity}
                    </span>

                    <button
                      aria-label={`Increase ${item.name} quantity`}
                      onClick={() => updateQuantity(item.id, 1)}
                      className="border p-2 rounded-lg"
                    >
                      <Plus size={15} />
                    </button>

                    <button
                      aria-label={`Remove ${item.name}`}
                      onClick={() => removeItem(item.id)}
                      className="text-red-500 p-2"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Equal split participant selection */}
                <div className="mt-4">
                  <p className="text-sm font-medium text-slate-600 mb-2">
                    Split equally between:
                  </p>

                  <div className="flex flex-wrap gap-x-5 gap-y-3">
                    {members.map((member) => {
                      const isSelected =
                        item.consumers.includes(member.id);

                      return (
                        <label
                          key={member.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() =>
                              toggleConsumer(item.id, member.id)
                            }
                            className="accent-teal-700"
                          />
                          {member.name}
                        </label>
                      );
                    })}
                  </div>

                  {item.consumers.length === 0 && (
                    <p className="text-red-600 text-xs mt-3">
                      Select at least one consumer.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Bill Adjustments */}
      <section className="bg-white border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Receipt className="text-teal-700" />
          <h2 className="text-lg font-bold">
            {t("Bill Adjustments")}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-slate-500 block mb-2">
              {t("Total Discount")} ({settings.currency})
            </label>

            <input
              type="number"
              min="0"
              step="0.01"
              value={discount === "" ? "" : fromBaseCurrency(discount, settings)}
              onChange={(e) => setDiscount(e.target.value === "" ? "" : String(toBaseCurrency(e.target.value, settings)))}
              className="w-full border rounded-xl p-3 outline-none"
            />
          </div>

          <div>
            <label className="text-sm text-slate-500 block mb-2">
              {t("Delivery and Other Fees")} ({settings.currency})
            </label>

            <input
              type="number"
              min="0"
              step="0.01"
              value={additionalFees === "" ? "" : fromBaseCurrency(additionalFees, settings)}
              onChange={(e) => setAdditionalFees(e.target.value === "" ? "" : String(toBaseCurrency(e.target.value, settings)))}
              className="w-full border rounded-xl p-3 outline-none"
            />
          </div>
        </div>
      </section>

      {/* Errors */}
      {(error || result.error) && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm"
        >
          {error || result.error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="bg-teal-50 border border-teal-200 text-teal-800 rounded-xl p-4 text-sm"
        >
          {success}
        </div>
      )}

      {/* Final Summary */}
      {split && (
        <section className="bg-white border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <Wallet className="text-teal-700" />

            <h2 className="text-lg font-bold">
              Individual Payment Summary
            </h2>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">
                Subtotal
              </span>

              <span>{money(split.subtotal)}</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-slate-500">
                Discount
              </span>

              <span className="text-green-600">
                -{money(split.discount)}
              </span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-slate-500">
                Additional Fees
              </span>

              <span>{money(split.additionalFees)}</span>
            </div>

            <div className="border-t pt-4 flex justify-between items-center">
              <span className="font-bold">
                Final Bill
              </span>

              <span className="text-2xl font-bold text-teal-700">
                {money(split.grandTotal)}
              </span>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {split.memberTotals.map((member) => (
              <div
                key={member.id}
                className="bg-slate-50 rounded-xl p-4 flex justify-between items-center"
              >
                <span className="font-medium">
                  {member.name}
                </span>

                <span className="text-lg font-bold text-slate-800">
                  {money(member.amount)}
                </span>
              </div>
            ))}
          </div>

          <div className="bg-teal-50 rounded-xl p-4 mt-5">
            <p className="text-sm text-teal-900">
              <IndianRupee size={16} className="inline" />
              {" "}The sum of all individual payments reconciles
              exactly with the final bill, including discounts
              and fees.
            </p>
          </div>

          <button
            type="button"
            onClick={completePurchase}
            disabled={
              items.length === 0 ||
              !split ||
              Number(split.grandTotal) <= 0 ||
              items.some((item) => !item.consumers || item.consumers.length === 0)
            }
            className="w-full mt-5 bg-teal-700 text-white rounded-xl px-5 py-3 font-semibold hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm Purchase and Update Budget
          </button>
        </section>
      )}
    </div>
  );
}
