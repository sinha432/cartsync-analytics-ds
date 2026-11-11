
import {
  addTransaction,
  getTransactions,
  deleteTransaction,
} from "./spendingLedger";

const purchase = addTransaction({
  name: "CartSync Test Purchase",
  amount: 130,
  category: "Groceries",
  source: "test",
});

console.log("Purchase created:", purchase);
console.log("All transactions:", getTransactions());

deleteTransaction(purchase.id);

console.log("After deletion:", getTransactions());
