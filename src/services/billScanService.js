const SUMMARY_LINE = /\b(sub\s*total|grand\s*total|total\s*amount|net\s*amount|amount\s*payable|taxable\s*amount|discount|cgst|sgst|igst|gst|tax|delivery\s*fee|service\s*charge|handling\s*charge|invoice|bill\s*no|receipt|payment|upi|barcode|you\s+saved)\b/i;
const MONEY_TOKEN = /(?:₹|rs\.?|inr)?\s*(-?\d[\d,]*(?:\.\d{1,2})?)/gi;

function readMoney(value) {
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function numbersIn(text) {
  return [...String(text).matchAll(MONEY_TOKEN)]
    .map((match) => readMoney(match[1]))
    .filter((value) => value !== null);
}

function flattenOcrLines(data) {
  const lines = data?.lines;
  if (Array.isArray(lines) && lines.length > 0) return lines;

  const blockLines = data?.blocks?.flatMap((block) =>
    block.paragraphs?.flatMap((paragraph) => paragraph.lines ?? []) ?? []
  );
  if (blockLines?.length) return blockLines;

  return String(data?.text ?? data ?? "")
    .split(/\r?\n/)
    .map((text) => ({ text, words: [] }));
}

function textOf(line) {
  return String(line?.text ?? line ?? "").replace(/\s+/g, " ").trim();
}

function wordCenter(word) {
  const box = word?.bbox;
  if (!Number.isFinite(box?.x0) || !Number.isFinite(box?.x1)) return null;
  return (box.x0 + box.x1) / 2;
}

function wordNumber(word) {
  const match = String(word?.text ?? "").replace(/[Oo]/g, "0").match(/^-?\d[\d,]*(?:\.\d{1,2})?$/);
  return match ? readMoney(match[0]) : null;
}

function headerColumns(lines) {
  const header = lines.find((line) => {
    const text = textOf(line).toLowerCase();
    return /item\s+description/.test(text) && /\b(?:qty|quantity)\b/.test(text) && /\bprice\b/.test(text);
  });
  if (!header || !Array.isArray(header.words) || header.words.length === 0) return null;

  const centerMatching = (pattern) => {
    const word = header.words.find((candidate) => pattern.test(String(candidate.text ?? "")));
    return wordCenter(word);
  };
  const descriptionEnd = Math.max(
    ...header.words
      .filter((word) => /description/i.test(String(word.text ?? "")))
      .map((word) => word.bbox?.x1 ?? Number.NEGATIVE_INFINITY)
  );
  const columns = {
    descriptionEnd,
    quantity: centerMatching(/^(?:qty|quantity|qly)$/i),
    mrp: centerMatching(/^mrp$/i),
    discount: centerMatching(/^(?:disc|discount)$/i),
    price: centerMatching(/^price$/i)
  };

  return Number.isFinite(columns.descriptionEnd) &&
    Number.isFinite(columns.quantity) &&
    Number.isFinite(columns.price)
    ? { header, columns }
    : null;
}

function parseRowByColumns(line, columns) {
  const words = [...(line.words ?? [])].sort((a, b) => (a.bbox?.x0 ?? 0) - (b.bbox?.x0 ?? 0));
  if (words.length < 4) return null;

  const serialWord = words.find((word) =>
    wordCenter(word) !== null &&
    wordCenter(word) < columns.descriptionEnd &&
    /^\d{1,3}$/.test(String(word.text ?? "").trim())
  );
  if (!serialWord) return null;

  const quantityStart = (columns.descriptionEnd + columns.quantity) / 2;
  const mrpStart = Number.isFinite(columns.mrp) ? (columns.quantity + columns.mrp) / 2 : columns.quantity + 18;
  const priceStart = Number.isFinite(columns.discount)
    ? (columns.discount + columns.price) / 2
    : (columns.quantity + columns.price) / 2;
  const quantityWord = words
    .filter((word) => {
      const center = wordCenter(word);
      return center !== null && center >= quantityStart && center < mrpStart;
    })
    .find((word) => wordNumber(word) !== null);
  const priceWord = words
    .filter((word) => {
      const center = wordCenter(word);
      return center !== null && center >= priceStart;
    })
    .reverse()
    .find((word) => wordNumber(word) !== null);
  const quantity = quantityWord ? wordNumber(quantityWord) : null;
  const lineTotal = priceWord ? wordNumber(priceWord) : null;
  if (!quantity || !Number.isInteger(quantity) || quantity > 10000 || !lineTotal || lineTotal <= 0) return null;

  const name = words
    .filter((word) => {
      const center = wordCenter(word);
      return center !== null &&
        center > (serialWord.bbox?.x1 ?? 0) &&
        center < quantityStart;
    })
    .map((word) => word.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return name ? { name, quantity, lineTotal } : null;
}

function parsePlainRow(line) {
  const text = textOf(line);
  const serial = text.match(/^\s*(\d{1,3})[.)]?\s+(.+)$/);
  if (!serial || SUMMARY_LINE.test(text)) return null;

  const remainder = serial[2].trim();
  const fourColumns = remainder.match(
    /^(.*?)\s+(\d{1,4})\s+[\d,]+(?:\.\d{1,2})?\s+[\d,]+(?:\.\d{1,2})?\s+[-‐‑–—]*([\d,]+(?:\.\d{1,2})?)\s*$/
  );
  const threeColumns = remainder.match(
    /^(.*?)\s+(\d{1,4})\s+[\d,]+(?:\.\d{1,2})?\s+[-‐‑–—]*([\d,]+(?:\.\d{1,2})?)\s*$/
  );
  const columns = fourColumns ?? threeColumns;
  if (!columns) return null;

  const name = columns[1].replace(/[\s|:;=-]+$/, "").trim();
  const quantity = Number(columns[2]);
  const lineTotal = readMoney(columns[3]);
  if (!name || name.length < 2 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000 || !lineTotal) {
    return null;
  }

  return { name, quantity, lineTotal };
}

function parseSummary(lines) {
  const summary = {
    subtotal: null,
    taxableAmount: null,
    discount: 0,
    additionalFees: 0,
    expectedTotal: null
  };
  let taxFound = false;
  let extraFeeFound = false;

  for (const line of lines) {
    const text = textOf(line);
    const values = numbersIn(text);
    const amount = values.at(-1);
    if (amount === undefined) continue;

    if (/\bsub\s*total\b/i.test(text)) {
      summary.subtotal = amount;
    } else if (/\b(?:total\s+amount|grand\s*total|net\s*amount|amount\s*payable)\b/i.test(text)) {
      summary.expectedTotal = amount;
    } else if (/\btaxable\s+amount\b/i.test(text)) {
      summary.taxableAmount = amount;
    } else if (/\b(?:total\s+)?discount\b|\byou\s+saved\b/i.test(text)) {
      summary.discount = amount;
    } else if (/\b(?:cgst|sgst|igst|gst|tax)\b/i.test(text)) {
      summary.additionalFees += amount;
      taxFound = true;
    } else if (/\b(?:delivery\s+fee|service\s+charge|handling\s+charge|packaging\s+charge|convenience\s+fee)\b/i.test(text)) {
      summary.additionalFees += amount;
      extraFeeFound = true;
    }
  }

  if (!taxFound && !extraFeeFound) summary.additionalFees = 0;
  summary.discount = Math.round(summary.discount * 100) / 100;
  summary.additionalFees = Math.round(summary.additionalFees * 100) / 100;
  return summary;
}

export function parseBillScan(ocrData) {
  const lines = flattenOcrLines(ocrData);
  const header = headerColumns(lines);
  const summary = parseSummary(lines);
  const rowLines = header
    ? lines.slice(lines.indexOf(header.header) + 1).filter((line) => {
      const text = textOf(line);
      return text && !SUMMARY_LINE.test(text);
    })
    : lines.filter((line) => !SUMMARY_LINE.test(textOf(line)));

  const seen = new Set();
  const items = [];
  for (const line of rowLines) {
    const parsed = header
      ? parseRowByColumns(line, header.columns) ?? parsePlainRow(line)
      : parsePlainRow(line);
    if (!parsed) continue;

    const identity = `${parsed.name.toLocaleLowerCase()}|${parsed.quantity}|${parsed.lineTotal}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    items.push({
      name: parsed.name,
      quantity: parsed.quantity,
      lineTotal: parsed.lineTotal,
      price: Math.round((parsed.lineTotal / parsed.quantity) * 100) / 100
    });
  }

  if (summary.subtotal !== null && summary.taxableAmount !== null) {
    const derivedDiscount = moneyDifference(summary.subtotal, summary.taxableAmount);
    if (derivedDiscount !== null) summary.discount = derivedDiscount;
  }
  if (summary.taxableAmount !== null && summary.expectedTotal !== null) {
    const derivedFees = moneyDifference(summary.expectedTotal, summary.taxableAmount);
    if (derivedFees !== null) summary.additionalFees = derivedFees;
  } else if (summary.subtotal !== null && summary.expectedTotal !== null) {
    const derivedFees = moneyDifference(
      summary.expectedTotal,
      summary.subtotal - summary.discount
    );
    if (derivedFees !== null) summary.additionalFees = derivedFees;
  }

  return { items, summary };
}

function moneyDifference(left, right) {
  const difference = left - right;
  if (!Number.isFinite(difference) || difference < 0) return null;
  return Math.round((difference + Number.EPSILON) * 100) / 100;
}

export function parseBillItems(text) {
  return parseBillScan({ text }).items;
}
