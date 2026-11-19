import { useEffect, useMemo, useRef, useState } from "react";
import { createWorker } from "tesseract.js";
import { AlertTriangle, Camera, CheckCircle2, FileText, ScanLine, Search, Trash2 } from "lucide-react";
import { fromBaseCurrency, toBaseCurrency } from "../services/appLocale";
import { parseBillScan } from "../services/billScanService";
import { calculateExpenseSplit } from "../services/expenseService";
import { getTransactions, subscribeToLedger } from "../services/spendingLedger";
import { fetchMongoBills, saveBillToMongoDB } from "../services/billsApi";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const moneyInBase = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function isValidAmount(value) {
  return value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
}

function isValidAdjustment(value) {
  return value !== "" && Number.isFinite(Number(value));
}

async function prepareOcrImage(file) {
  if (typeof createImageBitmap !== "function") return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This image format could not be opened. Try a JPG or PNG photo.");
  }

  try {
    const maxDimension = 3600;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The browser could not prepare this image for text recognition.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser could not prepare this image for text recognition."));
      }, "image/png");
    });
  } finally {
    bitmap.close();
  }
}

export default function BillScanner({ members, settings, onAddItems }) {
  const fileInput = useRef(null);
  const previewUrlRef = useRef("");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [reviewItems, setReviewItems] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [rawText, setRawText] = useState("");
  const [receiptSubtotal, setReceiptSubtotal] = useState("");
  const [receiptTaxableAmount, setReceiptTaxableAmount] = useState("");
  const [discount, setDiscount] = useState("0");
  const [additionalFees, setAdditionalFees] = useState("0");
  const [roundingAdjustment, setRoundingAdjustment] = useState("0");
  const [expectedTotal, setExpectedTotal] = useState("");
  const [feesAllocation, setFeesAllocation] = useState("proportional");
  const [adjustmentAllocation, setAdjustmentAllocation] = useState("proportional");
  const [acknowledgeMismatch, setAcknowledgeMismatch] = useState(false);
  const [invoice, setInvoice] = useState({
    storeName: "",
    invoiceNumber: "",
    invoiceDate: "",
    paymentMethod: ""
  });
  const [historySearch, setHistorySearch] = useState("");
  const [transactions, setTransactions] = useState(() => getTransactions());
  const [mongoBills, setMongoBills] = useState([]);
  const [mongoStatus, setMongoStatus] = useState("Connecting to local MongoDB...");
  const [mongoError, setMongoError] = useState("");

  useEffect(() => subscribeToLedger(setTransactions), []);
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function loadAndSyncBills() {
      try {
        const bills = await fetchMongoBills(historySearch, controller.signal);
        const savedIds = new Set(bills.map((bill) => bill.id));
        const browserBills = transactions.filter(
          (transaction) =>
            transaction.source === "expense-splitter" &&
            !savedIds.has(transaction.id)
        );
        const syncErrors = [];

        for (const transaction of browserBills) {
          if (controller.signal.aborted) return;
          try {
            await saveBillToMongoDB(transaction);
          } catch (syncError) {
            syncErrors.push(syncError.message);
          }
        }

        const updatedBills = browserBills.length > 0
          ? await fetchMongoBills(historySearch, controller.signal)
          : bills;
        if (controller.signal.aborted) return;

        setMongoBills(updatedBills);
        setMongoStatus("Connected to local MongoDB.");
        setMongoError(syncErrors.length > 0
          ? `${syncErrors.length} browser bill${syncErrors.length === 1 ? "" : "s"} could not be copied to MongoDB: ${syncErrors[0]}`
          : "");
      } catch (requestError) {
        if (requestError.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setMongoError(requestError.message);
        setMongoStatus("Could not load bills from local MongoDB.");
      }
    }

    loadAndSyncBills();

    return () => controller.abort();
  }, [historySearch, transactions]);

  const selectedItems = useMemo(
    () => reviewItems.filter((item) => item.included),
    [reviewItems]
  );
  const calculatedSubtotal = useMemo(
    () => moneyInBase(selectedItems.reduce(
      (sum, item) => sum + Number(
        item.lineTotal ?? Number(item.price || 0) * Number(item.quantity || 0)
      ),
      0
    )),
    [selectedItems]
  );
  const calculatedTotal = useMemo(() => {
    if (!isValidAmount(discount) || !isValidAmount(additionalFees) ||
        !isValidAdjustment(roundingAdjustment)) return null;
    return moneyInBase(
      calculatedSubtotal - Number(discount) + Number(additionalFees) + Number(roundingAdjustment)
    );
  }, [calculatedSubtotal, discount, additionalFees, roundingAdjustment]);
  const splitPreview = useMemo(() => {
    if (selectedItems.length === 0) return { data: null, error: "" };
    if (!isValidAmount(discount) || !isValidAmount(additionalFees) ||
        !isValidAdjustment(roundingAdjustment)) {
      return {
        data: null,
        error: "Enter valid discount, tax/fee, and receipt adjustment amounts to preview the split."
      };
    }

    try {
      return {
        data: calculateExpenseSplit({
          members,
          items: selectedItems.map((item) => ({
            id: item.id,
            name: item.name,
            quantity: Number(item.quantity),
            price: Number(item.price),
            lineTotal: item.lineTotal,
            consumers: item.consumers
          })),
          discount: Number(discount),
          additionalFees: Number(additionalFees),
          roundingAdjustment: Number(roundingAdjustment),
          feesAllocation,
          adjustmentAllocation
        }),
        error: ""
      };
    } catch (previewError) {
      return { data: null, error: previewError.message };
    }
  }, [
    selectedItems,
    members,
    discount,
    additionalFees,
    roundingAdjustment,
    feesAllocation,
    adjustmentAllocation
  ]);

  const issues = useMemo(() => {
    const messages = [];
    if (receiptSubtotal === "") {
      messages.push("The receipt subtotal was not recognized. Enter it if visible, or confirm that you checked the item lines.");
    } else if (Math.abs(calculatedSubtotal - Number(receiptSubtotal)) > 0.01) {
      messages.push(`Selected item lines total ${formatINR(calculatedSubtotal)}, but the receipt subtotal is ${formatINR(Number(receiptSubtotal))}.`);
    }
    if (receiptTaxableAmount !== "" && !isValidAmount(receiptTaxableAmount)) {
      messages.push("Enter a valid non-negative printed taxable amount.");
    } else if (receiptTaxableAmount !== "" && receiptSubtotal !== "" &&
        isValidAmount(discount)) {
      const calculatedTaxableAmount = Number(receiptSubtotal) - Number(discount);
      if (Math.abs(calculatedTaxableAmount - Number(receiptTaxableAmount)) > 0.01) {
        messages.push(`Subtotal minus the reviewed discount is ${formatINR(calculatedTaxableAmount)}, but the printed taxable amount is ${formatINR(Number(receiptTaxableAmount))}.`);
      }
    }
    if (expectedTotal === "") {
      messages.push("The receipt total was not recognized. Enter it if visible, or confirm that you checked the bill.");
    } else if (calculatedTotal !== null && Math.abs(calculatedTotal - Number(expectedTotal)) > 0.01) {
      messages.push(`Your reviewed total is ${formatINR(calculatedTotal)}, but the receipt total is ${formatINR(Number(expectedTotal))}.`);
    }
    return messages;
  }, [
    calculatedSubtotal,
    calculatedTotal,
    discount,
    expectedTotal,
    receiptSubtotal,
    receiptTaxableAmount
  ]);
  const billHistory = useMemo(() => {
    const query = historySearch.trim().toLocaleLowerCase();
    const localBills = transactions
      .filter((transaction) => transaction.source === "expense-splitter")
      .filter((transaction) => {
        if (!query) return true;
        const searchableText = [
          transaction.name,
          transaction.invoice?.storeName,
          transaction.invoice?.invoiceNumber,
          ...(Array.isArray(transaction.items)
            ? transaction.items.map((item) => item.name)
            : [])
        ].filter(Boolean).join(" ").toLocaleLowerCase();
        return searchableText.includes(query);
      });
    const seenIds = new Set(localBills.map((bill) => bill.id));
    return [
      ...localBills,
      ...mongoBills.filter((bill) => !seenIds.has(bill.id))
    ].sort((left, right) => new Date(right.date) - new Date(left.date));
  }, [transactions, mongoBills, historySearch]);

  function resetReview() {
    setReviewItems([]);
    setReceiptSubtotal("");
    setReceiptTaxableAmount("");
    setExpectedTotal("");
    setDiscount("0");
    setAdditionalFees("0");
    setRoundingAdjustment("0");
    setFeesAllocation("proportional");
    setAdjustmentAllocation("proportional");
    setAcknowledgeMismatch(false);
    setInvoice({
      storeName: "",
      invoiceNumber: "",
      invoiceDate: "",
      paymentMethod: ""
    });
  }

  function chooseFile(event) {
    const selected = event.target.files?.[0] ?? null;
    setError("");
    setRawText("");
    setProgress("");
    resetReview();

    if (selected && !selected.type.startsWith("image/")) {
      setSelectedFile(null);
      setError("Choose a bill image file.");
      event.target.value = "";
      return;
    }

    if (selected && selected.size > MAX_IMAGE_BYTES) {
      setSelectedFile(null);
      setError("Choose an image smaller than 12 MB.");
      event.target.value = "";
      return;
    }

    setSelectedFile(selected);
  }

  function setSelectedFile(selected) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = selected ? URL.createObjectURL(selected) : "";
    setPreviewUrl(previewUrlRef.current);
    setFile(selected);
  }

  async function scanBill() {
    if (!file) {
      setError("Upload or take a photo of a bill first.");
      return;
    }

    let worker;
    setScanning(true);
    setError("");
    setRawText("");
    resetReview();
    setProgress("Starting on-device text recognition...");

    try {
      worker = await createWorker("eng", undefined, {
        logger: (message) => {
          if (message.status) {
            const percent = Number.isFinite(message.progress)
              ? ` ${Math.round(message.progress * 100)}%`
              : "";
            setProgress(`${message.status}${percent}`);
          }
        }
      });

      setProgress("Preparing the image for text recognition...");
      const ocrImage = await prepareOcrImage(file);
      let scanResult = null;
      let bestScore = -1;
      for (const pageSegMode of ["6", "11", "4"]) {
        await worker.setParameters({
          tessedit_pageseg_mode: pageSegMode,
          preserve_interword_spaces: "1"
        });
        const { data } = await worker.recognize(ocrImage, {}, { blocks: true, text: true });
        const parsed = parseBillScan(data);
        const score = parsed.items.length * 100 +
          Number(parsed.summary.subtotal !== null) +
          Number(parsed.summary.expectedTotal !== null) +
          Number(Boolean(parsed.invoice.storeName));
        if (score > bestScore) {
          bestScore = score;
          scanResult = { data, parsed };
        }
        if (pageSegMode !== "4") {
          setProgress("Checking another receipt layout to recognize as many rows as possible...");
        }
      }

      if (!scanResult) {
        throw new Error("Text recognition did not return a result. Try another image.");
      }

      const { data } = scanResult;
      const { items, summary, invoice: scannedInvoice } = scanResult.parsed;
      setRawText(data.text);
      setInvoice({
        storeName: scannedInvoice.storeName ?? "",
        invoiceNumber: scannedInvoice.invoiceNumber ?? "",
        invoiceDate: scannedInvoice.invoiceDate ?? "",
        paymentMethod: scannedInvoice.paymentMethod ?? ""
      });

      if (items.length === 0) {
        setReceiptSubtotal(summary.subtotal === null ? "" : String(summary.subtotal));
        setReceiptTaxableAmount(summary.taxableAmount === null ? "" : String(summary.taxableAmount));
        setError("No complete item rows were recognized. Try a clearer, upright photo or add items manually; OCR will not guess missing prices.");
        return;
      }

      const consumers = members.map((member) => member.id);
      setReceiptSubtotal(summary.subtotal === null ? "" : String(summary.subtotal));
      setReceiptTaxableAmount(summary.taxableAmount === null ? "" : String(summary.taxableAmount));
      setDiscount(String(summary.discount));
      setAdditionalFees(String(summary.additionalFees));
      setRoundingAdjustment(String(summary.roundingAdjustment ?? 0));
      setExpectedTotal(summary.expectedTotal === null ? "" : String(summary.expectedTotal));
      setReviewItems(items.map((item, index) => ({
        ...item,
        id: `${Date.now()}-${index}`,
        quantity: String(item.quantity),
        price: String(item.price),
        discount: String(item.discount ?? 0),
        included: true,
        consumers
      })));
      setAcknowledgeMismatch(false);
      setProgress(`Found ${items.length} possible item rows. Review item prices and bill totals before adding.`);
    } catch (scanError) {
      setError(scanError.message
        ? `Could not process this bill image: ${scanError.message}`
        : "Could not process this bill image. Try another image or add items manually.");
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (terminationError) {
          setError(terminationError.message || "The OCR worker could not be stopped cleanly.");
        }
      }
      setScanning(false);
    }
  }

  function updateItem(id, changes) {
    setAcknowledgeMismatch(false);
    setReviewItems((oldItems) =>
      oldItems.map((item) => item.id === id ? { ...item, ...changes } : item)
    );
  }

  function toggleConsumer(item, memberId) {
    const consumers = item.consumers.includes(memberId)
      ? item.consumers.filter((id) => id !== memberId)
      : [...item.consumers, memberId];
    updateItem(item.id, { consumers });
  }

  function updateAdjustment(setter, event) {
    setAcknowledgeMismatch(false);
    const value = event.target.value;
    setter(value === "" ? "" : String(toBaseCurrency(value, settings)));
  }

  function updateSignedAdjustment(setter, event) {
    setAcknowledgeMismatch(false);
    const value = event.target.value;
    setter(value === "" ? "" : String(toBaseCurrency(value, settings)));
  }

  function addReviewedItems() {
    if (selectedItems.length === 0) {
      setError("Select at least one recognized item to add.");
      return;
    }
    if (selectedItems.some((item) =>
      !item.name.trim() ||
      (
        (!Number.isFinite(Number(item.lineTotal)) || Number(item.lineTotal) <= 0) &&
        (!Number.isFinite(Number(item.price)) || Number(item.price) <= 0)
      ) ||
      !Number.isInteger(Number(item.quantity)) ||
      Number(item.quantity) < 1 ||
      !Number.isFinite(Number(item.discount)) ||
      Number(item.discount) < 0 ||
      item.consumers.length === 0
    )) {
      setError("Each selected item needs a name, positive price and quantity, and at least one person.");
      return;
    }
    if (Number(discount) > calculatedSubtotal) {
      setError("The discount cannot be larger than the selected item subtotal.");
      return;
    }
    if (issues.length > 0 && !acknowledgeMismatch) {
      const confirmed = window.confirm(
        `Receipt totals do not match:\n\n${issues.map((issue) => `- ${issue}`).join("\n")}\n\nAdd the reviewed items anyway?`
      );
      if (!confirmed) return;
    }
    if (!isValidAmount(discount) || !isValidAmount(additionalFees) ||
        !isValidAdjustment(roundingAdjustment)) {
      setError("Enter a valid discount, tax/fee, and receipt adjustment amount.");
      return;
    }

    const added = onAddItems(
      selectedItems.map(({ name, quantity, price, lineTotal, discount: itemDiscount, consumers }) => ({
        name: name.trim(),
        quantity: Number(quantity),
        price: Number(price),
        discount: Number(itemDiscount || 0),
        ...(lineTotal === null || lineTotal === undefined ? {} : { lineTotal }),
        consumers
      })),
      {
        discount: moneyInBase(discount),
        additionalFees: moneyInBase(additionalFees),
        roundingAdjustment: moneyInBase(roundingAdjustment),
        feesAllocation,
        adjustmentAllocation
      },
      Object.fromEntries(
        Object.entries(invoice).map(([key, value]) => [key, value.trim() || null])
      )
    );
    if (added === false) return;
    resetReview();
    setRawText("");
    setSelectedFile(null);
    setProgress("");
    setError("");
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-teal-50 p-2 text-teal-700">
          <ScanLine size={21} />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-800">Scan a bill</h2>
          <p className="mt-1 text-sm text-slate-500">
            Upload a bill image or take a photo. Text recognition runs in your browser; the bill image is not uploaded.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
          <Camera size={18} className="shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1 truncate text-sm text-slate-600">
            {file?.name ?? "Choose or photograph a bill"}
          </span>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={chooseFile}
            disabled={scanning}
            className="sr-only"
            aria-label="Upload or photograph a bill"
          />
          <span className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
            Browse
          </span>
        </label>
        <button
          type="button"
          onClick={scanBill}
          disabled={!file || scanning}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ScanLine size={17} />
          {scanning ? "Scanning..." : "Scan bill"}
        </button>
      </div>

      {previewUrl && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2">
          <img
            src={previewUrl}
            alt={`Preview of ${file?.name ?? "the selected bill"}`}
            className="mx-auto max-h-80 max-w-full object-contain"
            onError={() => setError("This image cannot be previewed in the browser. Choose a JPG or PNG image.")}
          />
        </div>
      )}

      {progress && <p role="status" aria-live="polite" className="text-sm text-slate-500">{progress}</p>}
      {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}

      {reviewItems.length > 0 && (
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-slate-800">Review recognized items</h3>
              <p className="mt-1 text-xs text-slate-500">
                Receipt row prices are treated as line totals; edit unit price or quantity if needed. Adding this bill replaces the current cart.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Choose who shares each item below. Each item is split equally among its selected people; all household members start selected.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { resetReview(); setRawText(""); }}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-slate-500 hover:bg-slate-50"
            >
              <Trash2 size={14} /> Discard scan
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
            <TextField
              label="Store name"
              value={invoice.storeName}
              onChange={(value) => setInvoice((current) => ({ ...current, storeName: value }))}
            />
            <TextField
              label="Invoice number"
              value={invoice.invoiceNumber}
              onChange={(value) => setInvoice((current) => ({ ...current, invoiceNumber: value }))}
            />
            <TextField
              label="Invoice date"
              value={invoice.invoiceDate}
              onChange={(value) => setInvoice((current) => ({ ...current, invoiceDate: value }))}
            />
            <TextField
              label="Payment method"
              value={invoice.paymentMethod}
              onChange={(value) => setInvoice((current) => ({ ...current, paymentMethod: value }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
            <SummaryAmount label="Item subtotal" value={formatINR(calculatedSubtotal)} />
            <MoneyField
              label="Receipt subtotal"
              value={receiptSubtotal}
              settings={settings}
              onChange={(event) => updateAdjustment(setReceiptSubtotal, event)}
            />
            <MoneyField
              label="Printed taxable amount"
              value={receiptTaxableAmount}
              settings={settings}
              onChange={(event) => updateAdjustment(setReceiptTaxableAmount, event)}
            />
            <MoneyField
              label="Discount"
              value={discount}
              settings={settings}
              onChange={(event) => updateAdjustment(setDiscount, event)}
            />
            <MoneyField
              label="Tax and fees"
              value={additionalFees}
              settings={settings}
              onChange={(event) => updateAdjustment(setAdditionalFees, event)}
            />
            <MoneyField
              label="Receipt adjustment"
              value={roundingAdjustment}
              settings={settings}
              allowNegative
              onChange={(event) => updateSignedAdjustment(setRoundingAdjustment, event)}
            />
            <MoneyField
              label="Receipt total"
              value={expectedTotal}
              settings={settings}
              onChange={(event) => updateAdjustment(setExpectedTotal, event)}
            />
            <SummaryAmount
              label="Calculated total"
              value={calculatedTotal === null ? "Enter valid adjustments" : formatINR(calculatedTotal)}
              detail="Subtotal − discount + tax/fees + receipt adjustment"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AllocationField
              label="Tax and fees allocation"
              value={feesAllocation}
              onChange={setFeesAllocation}
            />
            <AllocationField
              label="Receipt adjustment allocation"
              value={adjustmentAllocation}
              onChange={setAdjustmentAllocation}
            />
          </div>

          {issues.length > 0 ? (
            <details className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-amber-950">
                <AlertTriangle size={18} className="shrink-0" />
                Receipt totals need review ({issues.length})
              </summary>
              <div className="mt-3 space-y-3 text-sm text-amber-950">
                <div>
                  <ul className="mt-1 list-inside list-disc">
                    {issues.map((issue) => <li key={issue}>{issue}</li>)}
                  </ul>
                  <p className="mt-1 text-xs">Correct the values or explicitly confirm that you reviewed the difference.</p>
                </div>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={acknowledgeMismatch}
                    onChange={(event) => setAcknowledgeMismatch(event.target.checked)}
                    className="mt-0.5 accent-amber-700"
                  />
                  I reviewed the mismatch and still want to add these items.
                </label>
              </div>
            </details>
          ) : (
            <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 size={17} /> Scanned subtotal and total reconcile.
            </p>
          )}

          {reviewItems.map((item) => (
            <article key={item.id} className="space-y-3 rounded-xl border border-slate-200 p-3 sm:p-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(0,1fr)_110px_80px_120px]">
                <label className="flex items-center justify-center px-2">
                  <input
                    type="checkbox"
                    checked={item.included}
                    onChange={(event) => updateItem(item.id, { included: event.target.checked })}
                    aria-label={`Include ${item.name}`}
                    className="h-4 w-4 accent-teal-700"
                  />
                </label>
                <input
                  value={item.name}
                  onChange={(event) => updateItem(item.id, { name: event.target.value })}
                  placeholder="Product name"
                  aria-label="Recognized product name"
                  className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.discount === "" ? "" : fromBaseCurrency(item.discount, settings)}
                  onChange={(event) => updateItem(item.id, {
                    discount: event.target.value === ""
                      ? ""
                      : String(toBaseCurrency(event.target.value, settings))
                  })}
                  aria-label={`Receipt discount for ${item.name} in ${settings.currency}`}
                  placeholder="Discount"
                  className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={item.quantity}
                  onChange={(event) => updateItem(item.id, {
                    quantity: event.target.value,
                    lineTotal: null
                  })}
                  aria-label={`Quantity for ${item.name}`}
                  placeholder="Qty"
                  className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={item.price === "" ? "" : fromBaseCurrency(item.price, settings)}
                  onChange={(event) => updateItem(item.id, {
                    price: event.target.value === "" ? "" : String(toBaseCurrency(event.target.value, settings)),
                    lineTotal: null
                  })}
                  aria-label={`Unit price for ${item.name} in ${settings.currency}`}
                  placeholder="Unit price"
                  className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 text-xs text-slate-500 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="font-medium">Share equally with ({item.consumers.length} selected):</span>
                  {members.map((member) => (
                    <label key={member.id} className="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={item.consumers.includes(member.id)}
                        onChange={() => toggleConsumer(item, member.id)}
                        className="accent-teal-700"
                      />
                      {member.name}
                    </label>
                  ))}
                </div>
                <span className="font-medium text-slate-700">
                  Line total: {formatINR(moneyInBase(
                    item.lineTotal ?? Number(item.price || 0) * Number(item.quantity || 0)
                  ))}
                </span>
              </div>
            </article>
          ))}

          <section
            aria-live="polite"
            className="rounded-xl border border-teal-200 bg-teal-50 p-4"
          >
            <h4 className="font-semibold text-teal-950">Estimated split before adding items</h4>
            <p className="mt-1 text-xs text-teal-800">
              Shares update as you edit item details, select people, or change discounts and fees.
            </p>
            {splitPreview.data ? (
              <>
                <p className="mt-3 flex justify-between gap-3 border-b border-teal-200 pb-2 text-sm font-semibold text-teal-950">
                  <span>Bill total</span>
                  <span>{formatINR(splitPreview.data.grandTotal)}</span>
                </p>
                <ul className="mt-2 space-y-2">
                  {splitPreview.data.memberTotals.map((member) => (
                    <li key={member.id} className="flex justify-between gap-3 text-sm text-teal-950">
                      <span>{member.name}</span>
                      <span className="font-semibold">{formatINR(member.amount)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-3 text-sm text-amber-900" role="status">
                {splitPreview.error
                  ? `Unable to preview split: ${splitPreview.error}`
                  : "Select at least one recognized item to preview the split."}
              </p>
            )}
          </section>

          <button
            type="button"
            onClick={addReviewedItems}
            className="w-full rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add {selectedItems.length} reviewed items to split
          </button>
        </div>
      )}

      {rawText && reviewItems.length === 0 && (
        <details className="rounded-xl bg-slate-50 p-3">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
            <FileText size={14} /> View recognized text
          </summary>
          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-600">{rawText}</pre>
        </details>
      )}

      <section className="space-y-3 border-t border-slate-100 pt-4">
        <div>
          <h3 className="font-semibold text-slate-800">Bill History</h3>
          <p className="mt-1 text-xs text-slate-500">
            Search confirmed grocery purchases by store, invoice number, or item.
          </p>
        </div>
        <p
          role={mongoError ? "alert" : "status"}
          className={`rounded-xl bg-slate-50 p-3 text-xs ${mongoError ? "text-red-700" : "text-slate-500"}`}
        >
          {mongoError || mongoStatus}
        </p>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
          <Search size={17} className="shrink-0 text-slate-400" />
          <input
            type="search"
            value={historySearch}
            onChange={(event) => setHistorySearch(event.target.value)}
            placeholder="Search bills, stores, invoice numbers, or items"
            aria-label="Search bill history"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <p className="text-xs text-slate-500">
          {billHistory.length} bill{billHistory.length === 1 ? "" : "s"} found
        </p>
        {billHistory.length > 0 ? (
          <div className="space-y-2">
            {billHistory.map((transaction) => (
              <details key={transaction.id} className="rounded-xl border border-slate-200 p-3">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-800">
                    {transaction.invoice?.storeName || transaction.name}
                    {transaction.invoice?.invoiceNumber && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        Invoice {transaction.invoice.invoiceNumber}
                      </span>
                    )}
                  </span>
                  <span className="font-semibold text-slate-800">
                    {formatINR(Number(transaction.amount))}
                  </span>
                </summary>
                <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <p>Date: {transaction.invoice?.invoiceDate || formatTransactionDate(transaction.date)}</p>
                  {transaction.invoice?.paymentMethod && <p>Payment: {transaction.invoice.paymentMethod}</p>}
                  <p>{transaction.items?.length ?? 0} items</p>
                  {transaction.items?.map((item, index) => (
                    <p key={`${transaction.id}-${index}`} className="flex justify-between gap-3">
                      <span>{item.name} × {item.quantity}</span>
                      <span>{formatINR(Number(item.total ?? item.unitPrice * item.quantity))}</span>
                    </p>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">
            {historySearch ? "No bills match your search." : "Confirmed scanned bills will appear here."}
          </p>
        )}
      </section>
    </section>
  );
}

function formatINR(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);
}

function SummaryAmount({ label, value, detail }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="break-words font-semibold text-slate-800">{value}</p>
      {detail && <p className="break-words text-[11px] text-slate-500">{detail}</p>}
    </div>
  );
}

function MoneyField({ label, value, settings, onChange, allowNegative = false }) {
  return (
    <label className="min-w-0">
      <span className="text-xs text-slate-500">{label} ({settings.currency})</span>
      <input
        type="number"
        min={allowNegative ? undefined : "0"}
        step="0.01"
        value={value === "" ? "" : fromBaseCurrency(value, settings)}
        onChange={onChange}
        className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
      />
    </label>
  );
}

function AllocationField({ label, value, onChange }) {
  return (
    <label className="min-w-0">
      <span className="text-xs text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
      >
        <option value="proportional">Proportional to item shares</option>
        <option value="equal">Equally across all people</option>
      </select>
    </label>
  );
}

function TextField({ label, value, onChange }) {
  return (
    <label className="min-w-0 text-xs text-slate-500">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
      />
    </label>
  );
}

function formatTransactionDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleDateString();
}
