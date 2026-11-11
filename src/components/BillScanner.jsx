import { useMemo, useRef, useState } from "react";
import { createWorker } from "tesseract.js";
import { AlertTriangle, Camera, CheckCircle2, FileText, ScanLine, Trash2 } from "lucide-react";
import { fromBaseCurrency, toBaseCurrency } from "../services/appLocale";
import { parseBillScan } from "../services/billScanService";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const moneyInBase = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function isValidAmount(value) {
  return value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
}

export default function BillScanner({ members, settings, onAddItems }) {
  const fileInput = useRef(null);
  const [file, setFile] = useState(null);
  const [reviewItems, setReviewItems] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [rawText, setRawText] = useState("");
  const [receiptSubtotal, setReceiptSubtotal] = useState("");
  const [discount, setDiscount] = useState("0");
  const [additionalFees, setAdditionalFees] = useState("0");
  const [expectedTotal, setExpectedTotal] = useState("");
  const [acknowledgeMismatch, setAcknowledgeMismatch] = useState(false);

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
    if (!isValidAmount(discount) || !isValidAmount(additionalFees)) return null;
    return moneyInBase(calculatedSubtotal - Number(discount) + Number(additionalFees));
  }, [calculatedSubtotal, discount, additionalFees]);

  const issues = useMemo(() => {
    const messages = [];
    if (receiptSubtotal === "") {
      messages.push("The receipt subtotal was not recognized. Enter it if visible, or confirm that you checked the item lines.");
    } else if (Math.abs(calculatedSubtotal - Number(receiptSubtotal)) > 0.01) {
      messages.push(`Selected item lines total ${formatINR(calculatedSubtotal)}, but the receipt subtotal is ${formatINR(Number(receiptSubtotal))}.`);
    }
    if (expectedTotal === "") {
      messages.push("The receipt total was not recognized. Enter it if visible, or confirm that you checked the bill.");
    } else if (calculatedTotal !== null && Math.abs(calculatedTotal - Number(expectedTotal)) > 0.01) {
      messages.push(`Your reviewed total is ${formatINR(calculatedTotal)}, but the receipt total is ${formatINR(Number(expectedTotal))}.`);
    }
    return messages;
  }, [calculatedSubtotal, calculatedTotal, expectedTotal, receiptSubtotal]);

  function resetReview() {
    setReviewItems([]);
    setReceiptSubtotal("");
    setExpectedTotal("");
    setDiscount("0");
    setAdditionalFees("0");
    setAcknowledgeMismatch(false);
  }

  function chooseFile(event) {
    const selected = event.target.files?.[0] ?? null;
    setError("");
    setRawText("");
    setProgress("");
    resetReview();

    if (selected && !selected.type.startsWith("image/")) {
      setFile(null);
      setError("Choose a bill image file.");
      event.target.value = "";
      return;
    }

    if (selected && selected.size > MAX_IMAGE_BYTES) {
      setFile(null);
      setError("Choose an image smaller than 12 MB.");
      event.target.value = "";
      return;
    }

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

      await worker.setParameters({
        tessedit_pageseg_mode: "6",
        preserve_interword_spaces: "1"
      });
      const { data } = await worker.recognize(file, {}, { blocks: true, text: true });
      setRawText(data.text);
      const { items, summary } = parseBillScan(data);

      if (items.length === 0) {
        setReceiptSubtotal(summary.subtotal === null ? "" : String(summary.subtotal));
        setError("No complete item rows were recognized. Try a clearer, upright photo or add items manually; OCR will not guess missing prices.");
        return;
      }

      const consumers = members.map((member) => member.id);
      setReceiptSubtotal(summary.subtotal === null ? "" : String(summary.subtotal));
      setDiscount(String(summary.discount));
      setAdditionalFees(String(summary.additionalFees));
      setExpectedTotal(summary.expectedTotal === null ? "" : String(summary.expectedTotal));
      setReviewItems(items.map((item, index) => ({
        ...item,
        id: `${Date.now()}-${index}`,
        quantity: String(item.quantity),
        price: String(item.price),
        included: true,
        consumers
      })));
      setAcknowledgeMismatch(false);
      setProgress(`Found ${items.length} possible item rows. Review item prices and bill totals before adding.`);
    } catch (scanError) {
      setError(scanError.message || "Unable to scan this bill image. Try another image or add items manually.");
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
      setError("Review the total mismatch and confirm below before adding these items.");
      return;
    }
    if (!isValidAmount(discount) || !isValidAmount(additionalFees)) {
      setError("Enter valid non-negative discount and tax/fee amounts.");
      return;
    }

    const added = onAddItems(
      selectedItems.map(({ name, quantity, price, lineTotal, consumers }) => ({
        name: name.trim(),
        quantity: Number(quantity),
        price: Number(price),
        ...(lineTotal === null || lineTotal === undefined ? {} : { lineTotal }),
        consumers
      })),
      {
        discount: moneyInBase(discount),
        additionalFees: moneyInBase(additionalFees)
      }
    );
    if (added === false) return;
    resetReview();
    setRawText("");
    setFile(null);
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
            </div>
            <button
              type="button"
              onClick={() => { resetReview(); setRawText(""); }}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-slate-500 hover:bg-slate-50"
            >
              <Trash2 size={14} /> Discard scan
            </button>
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
              label="Receipt total"
              value={expectedTotal}
              settings={settings}
              onChange={(event) => updateAdjustment(setExpectedTotal, event)}
            />
            <SummaryAmount
              label="Calculated total"
              value={calculatedTotal === null ? "Enter valid adjustments" : formatINR(calculatedTotal)}
              detail="Subtotal − discount + tax/fees"
            />
          </div>

          {issues.length > 0 ? (
            <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <div className="flex items-start gap-2 text-sm text-amber-950">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">The scanned amounts do not match yet.</p>
                  <ul className="mt-1 list-inside list-disc">
                    {issues.map((issue) => <li key={issue}>{issue}</li>)}
                  </ul>
                  <p className="mt-1 text-xs">Correct the values or explicitly confirm that you reviewed the difference.</p>
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm text-amber-950">
                <input
                  type="checkbox"
                  checked={acknowledgeMismatch}
                  onChange={(event) => setAcknowledgeMismatch(event.target.checked)}
                  className="mt-0.5 accent-amber-700"
                />
                I reviewed the mismatch and still want to add these items.
              </label>
            </div>
          ) : (
            <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 size={17} /> Scanned subtotal and total reconcile.
            </p>
          )}

          {reviewItems.map((item) => (
            <article key={item.id} className="space-y-3 rounded-xl border border-slate-200 p-3 sm:p-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(0,1fr)_100px_130px]">
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
                  <span className="font-medium">Split equally with:</span>
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

          <button
            type="button"
            onClick={addReviewedItems}
            disabled={issues.length > 0 && !acknowledgeMismatch}
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

function MoneyField({ label, value, settings, onChange }) {
  return (
    <label className="min-w-0">
      <span className="text-xs text-slate-500">{label} ({settings.currency})</span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value === "" ? "" : fromBaseCurrency(value, settings)}
        onChange={onChange}
        className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
      />
    </label>
  );
}
