const RETAILER_DATA_PATH = "data/retailer_prices.csv";
const JIOMART_DATA_PATH = "data/jiomart_scraped_data.csv";
const NANDINI_DATA_PATH = "data/cartsync_dummy_all_retailers_nandini.csv";
const UNAVAILABLE_BIGBASKET_IMAGE_IDS = new Set([
  "152541",
  "100285703",
  "270621",
  "242668",
  "40006910"
]);

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("A dataset CSV contains an unterminated quoted field.");
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((value) => value !== "")) rows.push(row);
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim()
  );
  return rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
  );
}

function parsePrice(value) {
  const match = String(value ?? "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const price = Number(match[0]);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function validImageUrl(value) {
  const url = String(value ?? "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

function productKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b(?:nandini|bigbasket|zepto|dmart|blinkit|jiomart|swiggy|instamart)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const PRODUCT_IMAGE_FALLBACKS = {
  [productKey("Ash Gourd 3.5 kg")]: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/ba/Benincasa_hispida-1-selvapuram-coimbatore-India.jpg/500px-Benincasa_hispida-1-selvapuram-coimbatore-India.jpg",
  [productKey("Brown Channa Sprouts 200 g")]: "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8b/Chickpeas_Sprout.jpg/500px-Chickpeas_Sprout.jpg",
  [productKey("Loose Classic Wada Kolam Rice 1 kg")]: "https://images.openfoodfacts.org/images/products/890/290/103/4431/front_en.3.400.jpg",
  [productKey("Loose Idly Rice 1 kg")]: "https://images.openfoodfacts.org/images/products/479/600/313/0016/front_en.3.400.jpg",
  [productKey("Loose Lokwan Grade One  Wheat 1 kg")]: "https://upload.wikimedia.org/wikipedia/commons/2/2a/Wheat_grains%2C_a_yellow_bean_among_vitreous_kernels.png",
  [productKey("Loose Ponni Boiled Rice 1 kg")]: "https://images.openfoodfacts.org/images/products/890/406/462/2098/front_fr.3.400.jpg",
  [productKey("Loose Raw Peanuts 1 kg")]: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4e/Groundnut_Seed.jpg/500px-Groundnut_Seed.jpg",
  [productKey("Loose Urad Dal 1 kg")]: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/48/Urad_dal_black_gram.jpg/500px-Urad_dal_black_gram.jpg",
  [productKey("Nandini Pure Ghee/Tuppa")]: "https://www.bbassets.com/media/uploads/p/l/40361894_1.jpg",
  [productKey("Nandini Fresh Paneer")]: "https://www.bbassets.com/media/uploads/p/l/40361896_1.jpg",
  [productKey("Nandini GoodLife UHT Treated Toned Milk")]: "https://www.bbassets.com/media/uploads/p/l/244999_1.jpg",
  [productKey("Nandini Unsalted Pasteurised Cooking Butter")]: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3c/Block_of_butter_in_butter_dish.jpg/500px-Block_of_butter_in_butter_dish.jpg",
  [productKey("Nandini GoodLife Gold Homogenised UHT Sterilized Standardised Milk")]: "https://www.bbassets.com/media/uploads/p/l/244999_1.jpg"
};

function findJiomartImage(row, productName) {
  const normalize = (value) => String(value ?? "")
    .toLowerCase()
    .replace(/\s+\d+$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const target = normalize(productName);

  for (const [descriptionField, description] of Object.entries(row)) {
    if (!descriptionField.startsWith("ProductCard__productImage Description") || !description) continue;
    if (normalize(description) !== target) continue;

    const suffix = descriptionField.match(/_(\d+)$/)?.[1];
    const imageField = `ProductCard__productImage Image${suffix ? `_${suffix}` : ""}`;
    const imageUrl = validImageUrl(row[imageField]);
    if (imageUrl) return imageUrl;
  }

  return "";
}

export function normalizeRetailerRows(rows) {
  return rows.flatMap((row, index) => {
    const price = parsePrice(row.price_inr);
    const name = row.product_name?.trim();
    if (!name || price === null) return [];

    return [{
      id: `retailer-${index}`,
      name,
      retailer: row.retailer?.trim() || "Retailer",
      category: row.category?.trim() || "Other",
      packSize: row.quantity?.trim() || "Pack size not supplied",
      price,
      mrp: parsePrice(row.mrp_inr),
      availability: row.availability?.trim() || "Availability not supplied",
      imageUrl: validImageUrl(row.image_url)
    }];
  });
}

export function normalizeJiomartRows(rows) {
  const listings = [];
  let id = 0;

  rows.forEach((row, rowIndex) => {
    for (let itemIndex = 1; itemIndex <= 13; itemIndex += 1) {
      const suffix = itemIndex === 1 ? "" : `_${itemIndex}`;
      const name = row[`ProductCard__productTitle${suffix}`]?.trim();
      const price = parsePrice(row[`PriceContainer__currentPrice${suffix}`]);

      // The scraped file has many prices without matching product titles; do not guess item names.
      if (!name || price === null) continue;

      listings.push({
        id: `jiomart-${rowIndex}-${itemIndex}-${id}`,
        name,
        retailer: "JioMart",
        category: row.Title?.trim() || "Other",
        packSize: row[`ProductCard__sizeSpan${suffix}`]?.trim() || "Pack size not supplied",
        price,
        mrp: parsePrice(row[`PriceContainer__originalPrice${suffix}`]),
        availability: "Availability not supplied",
        imageUrl: findJiomartImage(row, name)
      });
      id += 1;
    }
  });

  return listings;
}

export function normalizeNandiniRows(rows) {
  const imageByProduct = new Map(
    rows
      .filter((row) =>
        row.source_product_id &&
        !UNAVAILABLE_BIGBASKET_IMAGE_IDS.has(row.source_product_id)
      )
      .map((row) => [
        row.product_name?.trim(),
        `https://www.bbassets.com/media/uploads/p/l/${row.source_product_id}_1.jpg`
      ])
      .filter(([name]) => name)
  );

  return rows.flatMap((row, index) => {
    const price = parsePrice(row.price_inr);
    const name = row.product_name?.trim();
    if (!name || price === null) return [];

    const rawAvailability = row.availability?.trim().toLowerCase();
    const availability = rawAvailability === "in_stock"
      ? "In stock"
      : rawAvailability === "out_of_stock"
        ? "Out of stock"
        : "Availability not supplied";

    return [{
      id: `nandini-${index}`,
      name: [row.brand?.trim(), name].filter(Boolean).join(" "),
      retailer: row.retailer?.trim() || "Retailer",
      category: row.brand?.trim() || "Other",
      packSize: [row.pack_size?.trim(), row.variant?.trim()].filter(Boolean).join(" · ") || "Pack size not supplied",
      price,
      mrp: null,
      availability,
      imageUrl: imageByProduct.get(name) || ""
    }];
  });
}

async function fetchCsv(path) {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Unable to load the local price dataset (${response.status}).`);
  }
  return parseCsv(await response.text());
}

export async function loadGroceryDataset() {
  const [retailerRows, jiomartRows, nandiniRows] = await Promise.all([
    fetchCsv(RETAILER_DATA_PATH),
    fetchCsv(JIOMART_DATA_PATH),
    fetchCsv(NANDINI_DATA_PATH)
  ]);
  const listings = [
    ...normalizeRetailerRows(retailerRows),
    ...normalizeJiomartRows(jiomartRows),
    ...normalizeNandiniRows(nandiniRows)
  ];
  const imageByName = new Map();
  for (const listing of listings) {
    const key = productKey(listing.name);
    if (listing.imageUrl && key && !imageByName.has(key)) {
      imageByName.set(key, listing.imageUrl);
    }
  }
  for (const listing of listings) {
    const key = productKey(listing.name);
    if (!listing.imageUrl && key && imageByName.has(key)) {
      listing.imageUrl = imageByName.get(key);
    }
    if (!listing.imageUrl && key) {
      listing.imageUrl = PRODUCT_IMAGE_FALLBACKS[key] || "";
    }
  }

  if (listings.length === 0) {
    throw new Error("The supplied datasets did not contain any products with both a name and a valid price.");
  }

  return listings;
}
