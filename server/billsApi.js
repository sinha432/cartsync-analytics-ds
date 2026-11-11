import { timingSafeEqual } from "node:crypto";
import { getMongoDatabase } from "./mongo.js";

const COLLECTION_NAME = "bills";
const MAX_SEARCH_LENGTH = 100;
const MAX_ITEMS_PER_BILL = 500;

function sendJson(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function isAuthorized(request) {
  const expectedToken = process.env.CARTSYNC_API_TOKEN;
  const authorization = request.headers.authorization || "";
  const suppliedToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!expectedToken || !suppliedToken) return false;

  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function cleanText(value, maxLength = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizedDuplicateKey(invoice, amount) {
  const storeName = cleanText(invoice?.storeName).toLocaleLowerCase();
  const invoiceNumber = cleanText(invoice?.invoiceNumber).toLocaleLowerCase();
  const invoiceDate = cleanText(invoice?.invoiceDate).toLocaleLowerCase();
  if (!storeName || !invoiceNumber || !invoiceDate) return null;
  return JSON.stringify([storeName, invoiceNumber, invoiceDate, Math.round(amount * 100)]);
}

function normalizeBill(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Bill payload must be an object.");
  }

  const id = cleanText(body.id, 100);
  const name = cleanText(body.name);
  const amount = Number(body.amount);
  if (!id || !name || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("A bill ID, name, and positive total are required.");
  }
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_ITEMS_PER_BILL) {
    throw new Error(`A bill must contain between 1 and ${MAX_ITEMS_PER_BILL} items.`);
  }

  const items = body.items.map((item) => {
    const itemName = cleanText(item?.name);
    const quantity = Number(item?.quantity);
    const total = Number(item?.total);
    if (!itemName || !Number.isInteger(quantity) || quantity < 1 ||
        !Number.isFinite(total) || total < 0) {
      throw new Error("Each bill item needs a name, positive quantity, and valid total.");
    }
    return {
      name: itemName,
      quantity,
      unitPrice: Number.isFinite(Number(item.unitPrice)) ? Number(item.unitPrice) : 0,
      total,
      consumers: Array.isArray(item.consumers)
        ? item.consumers.filter((consumer) => typeof consumer === "string").slice(0, 100)
        : []
    };
  });

  const invoiceInput = body.invoice && typeof body.invoice === "object"
    ? body.invoice
    : {};
  const invoice = {
    storeName: cleanText(invoiceInput.storeName) || null,
    invoiceNumber: cleanText(invoiceInput.invoiceNumber) || null,
    invoiceDate: cleanText(invoiceInput.invoiceDate) || null,
    paymentMethod: cleanText(invoiceInput.paymentMethod) || null
  };
  const transactionDate = new Date(body.date || body.createdAt || Date.now());
  if (Number.isNaN(transactionDate.getTime())) {
    throw new Error("Bill date is invalid.");
  }

  return {
    _id: id,
    name,
    amount: Math.round(amount * 100) / 100,
    category: cleanText(body.category) || "Groceries",
    source: "expense-splitter",
    date: transactionDate.toISOString(),
    items,
    memberAllocations: Array.isArray(body.memberAllocations)
      ? body.memberAllocations.slice(0, 100).map((member) => ({
          memberId: cleanText(member?.memberId, 100),
          memberName: cleanText(member?.memberName),
          amount: Number.isFinite(Number(member?.amount))
            ? Number(member.amount)
            : 0
        }))
      : [],
    invoice: {
      ...invoice,
      duplicateKey: normalizedDuplicateKey(invoice, amount)
    },
    createdAt: new Date().toISOString()
  };
}

function toClientBill(document) {
  const { _id, ...bill } = document;
  return { ...bill, id: String(_id) };
}

async function ensureIndexes(collection) {
  if (!globalThis.cartsyncBillIndexesPromise) {
    globalThis.cartsyncBillIndexesPromise = Promise.all([
      collection.createIndex({ source: 1, date: -1 }),
      collection.createIndex(
        { "invoice.duplicateKey": 1 },
        {
          unique: true,
          partialFilterExpression: { "invoice.duplicateKey": { $type: "string" } }
        }
      )
    ]).catch((error) => {
      globalThis.cartsyncBillIndexesPromise = null;
      throw error;
    });
  }
  return globalThis.cartsyncBillIndexesPromise;
}

export default async function billsApi(request, response) {
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }
  if (!process.env.CARTSYNC_API_TOKEN) {
    return sendJson(response, 503, { error: "Atlas bill storage is not configured." });
  }
  if (!isAuthorized(request)) {
    return sendJson(response, 401, { error: "Enter the bill API token configured by the administrator." });
  }

  let bill;
  if (request.method === "POST") {
    try {
      bill = normalizeBill(request.body);
    } catch (validationError) {
      return sendJson(response, 400, { error: validationError.message });
    }
  }

  try {
    const database = await getMongoDatabase();
    const collection = database.collection(COLLECTION_NAME);
    await ensureIndexes(collection);

    if (request.method === "GET") {
      const rawSearch = Array.isArray(request.query?.search)
        ? request.query.search[0]
        : request.query?.search;
      const search = cleanText(rawSearch, MAX_SEARCH_LENGTH);
      const filter = search
        ? {
            $or: [
              { "invoice.storeName": { $regex: escapeRegex(search), $options: "i" } },
              { "invoice.invoiceNumber": { $regex: escapeRegex(search), $options: "i" } },
              { "items.name": { $regex: escapeRegex(search), $options: "i" } }
            ]
          }
        : {};
      const bills = await collection.find(filter).sort({ date: -1 }).limit(200).toArray();
      return sendJson(response, 200, { bills: bills.map(toClientBill) });
    }

    const existingId = await collection.findOne({ _id: bill._id });
    if (existingId) {
      return sendJson(response, 200, { bill: toClientBill(existingId), alreadySaved: true });
    }

    try {
      await collection.insertOne(bill);
    } catch (insertError) {
      if (insertError.code === 11000) {
        const duplicate = await collection.findOne({
          "invoice.duplicateKey": bill.invoice.duplicateKey
        });
        return sendJson(response, 409, {
          error: "This invoice appears to have already been saved.",
          existingBill: duplicate ? toClientBill(duplicate) : null
        });
      }
      throw insertError;
    }

    return sendJson(response, 201, { bill: toClientBill(bill), alreadySaved: false });
  } catch (error) {
    console.error("Bill API request failed:", error.message);
    return sendJson(response, 500, { error: "Could not access Atlas bill storage. Check server configuration." });
  }
}
