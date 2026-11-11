import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  CheckCircle2,
  IndianRupee,
  PackageSearch,
  Search
} from "lucide-react";
import { useAppSettings } from "../services/AppSettingsContext";
import { translate } from "../services/appLocale";
import { loadGroceryDataset } from "../services/groceryDataset";

function formatINR(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);
}

function isInStock(availability) {
  return availability.toLowerCase().includes("in stock") &&
    !availability.toLowerCase().includes("out of stock");
}

function AvailabilityBadge({ availability }) {
  const available = isInStock(availability);
  const unavailable = availability.toLowerCase().includes("out of stock");
  const styles = available
    ? "bg-emerald-50 text-emerald-700"
    : unavailable
      ? "bg-red-50 text-red-700"
      : "bg-slate-100 text-slate-600";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles}`}>
      {availability}
    </span>
  );
}

function ProductImage({ item }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="mb-4 flex h-36 items-center justify-center overflow-hidden rounded-xl bg-slate-50 p-2">
      {item.imageUrl && !failed
        ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="h-full w-full object-contain"
          />
        )
        : (
          <div className="text-center text-xs text-slate-500">
            <PackageSearch className="mx-auto mb-2 text-slate-400" size={30} />
            Product photo unavailable
          </div>
        )}
    </div>
  );
}

export default function GroceryComparison() {
  const { settings } = useAppSettings();
  const t = (text) => translate(text, settings.language);
  const [query, setQuery] = useState("");
  const [retailerFilter, setRetailerFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("ascending");
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    loadGroceryDataset()
      .then((rows) => {
        if (active) setListings(rows);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Unable to load the supplied product datasets.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const retailers = useMemo(
    () => [...new Set(listings.map((item) => item.retailer))].sort((a, b) => a.localeCompare(b)),
    [listings]
  );

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return listings
      .filter((item) =>
        (retailerFilter === "all" || item.retailer === retailerFilter) &&
        (!term || item.name.toLocaleLowerCase().includes(term))
      )
      .sort((a, b) => {
        const priceOrder = sortOrder === "ascending" ? a.price - b.price : b.price - a.price;
        return priceOrder || a.name.localeCompare(b.name);
      });
  }, [listings, query, retailerFilter, sortOrder]);

  const cheapestInStock = visible.find((item) => isInStock(item.availability));
  const retailerCount = new Set(visible.map((item) => item.retailer)).size;

  return (
    <div className="min-w-0 space-y-6">
      <header>
        <p className="text-xs font-semibold tracking-wide text-teal-700">
          CARTSYNC / DATASET PRICE COMPARISON
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-800">
          {t("Grocery Comparison")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Search the supplied retailer datasets and compare listed prices. Results are loaded locally; no pincode or product-search API is used.
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 px-3">
            <Search size={18} className="shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products, e.g. milk, banana, bread"
              className="w-full min-w-0 py-3 text-sm outline-none"
              aria-label="Search products"
            />
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
            <span className="shrink-0 text-xs text-slate-500">Retailer</span>
            <select
              value={retailerFilter}
              onChange={(event) => setRetailerFilter(event.target.value)}
              className="min-w-0 bg-transparent py-3 text-sm outline-none"
              aria-label="Filter by retailer"
            >
              <option value="all">All retailers</option>
              {retailers.map((retailer) => (
                <option key={retailer} value={retailer}>{retailer}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
            {sortOrder === "ascending"
              ? <ArrowUpWideNarrow size={17} className="shrink-0 text-teal-700" />
              : <ArrowDownWideNarrow size={17} className="shrink-0 text-teal-700" />}
            <select
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              className="w-full bg-transparent py-3 text-sm outline-none"
              aria-label="Sort prices"
            >
              <option value="ascending">Lowest to highest</option>
              <option value="descending">Highest to lowest</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>Prices are shown in Indian rupees from the supplied datasets.</span>
          <span className="inline-flex items-center gap-1">
            <IndianRupee size={13} />
            Lowest in-stock result is highlighted; unknown availability is not assumed to be in stock.
          </span>
        </div>
      </section>

      {loading && (
        <div role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          Loading the supplied product datasets...
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Summary title="Products shown" value={visible.length} />
            <Summary title="Retailers represented" value={retailerCount} />
            <Summary
              title="Lowest in-stock price"
              value={cheapestInStock ? formatINR(cheapestInStock.price) : "Not supplied"}
              detail={cheapestInStock ? `${cheapestInStock.name} · ${cheapestInStock.retailer}` : "No matching in-stock record"}
            />
          </section>

          {visible.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <PackageSearch className="mx-auto text-slate-400" size={30} />
              <p className="mt-3 font-semibold text-slate-700">No matching products</p>
              <p className="mt-1 text-sm text-slate-500">Try another product name or select all retailers.</p>
            </div>
          ) : (
            <section aria-label="Product price results">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-slate-800">Retailer price comparison</h2>
                <p className="text-xs text-slate-500" aria-live="polite">
                  Showing {visible.length} of {listings.length} dataset listings
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((item) => {
                  const isCheapest = item === cheapestInStock;
                  return (
                    <article
                      key={item.id}
                      className={`min-w-0 rounded-xl border p-4 ${
                        isCheapest ? "border-teal-500 bg-teal-50/40" : "border-slate-200 bg-white"
                      }`}
                    >
                      <ProductImage item={item} />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {item.retailer}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {isCheapest && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-teal-700 px-2 py-1 text-[10px] font-semibold text-white">
                              <CheckCircle2 size={11} /> Lowest in stock
                            </span>
                          )}
                          <AvailabilityBadge availability={item.availability} />
                        </div>
                      </div>
                      <h3 className="mt-3 break-words font-semibold text-slate-800">{item.name}</h3>
                      <p className="mt-1 break-words text-xs text-slate-500">
                        {item.category} · {item.packSize}
                      </p>
                      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
                        <p className="text-2xl font-bold text-slate-900">{formatINR(item.price)}</p>
                        {item.mrp !== null && item.mrp > item.price && (
                          <p className="text-xs text-slate-400">MRP {formatINR(item.mrp)}</p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <p className="text-xs text-slate-500">
            Source: the bundled retailer and JioMart datasets. Prices and availability reflect those files and may differ from current checkout listings.
          </p>
        </>
      )}
    </div>
  );
}

function Summary({ title, value, detail = "" }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 break-words text-xl font-bold text-slate-800">{value}</p>
      {detail && <p className="mt-1 break-words text-xs text-slate-500">{detail}</p>}
    </div>
  );
}
