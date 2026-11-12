export async function fetchMongoBills(search = "", signal) {
  const query = new URLSearchParams();
  if (search.trim()) query.set("search", search.trim());
  const response = await fetch(`/api/bills${query.size ? `?${query}` : ""}`, {
    signal
  });
  const result = await readResponse(response);
  return result.bills;
}

export async function saveBillToMongoDB(transaction) {
  const response = await fetch("/api/bills", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(transaction)
  });
  return readResponse(response);
}

async function readResponse(response) {
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Local MongoDB API returned an invalid response (${response.status}).`);
  }
  if (!response.ok) {
    const error = new Error(result.error || `Local MongoDB API request failed (${response.status}).`);
    error.status = response.status;
    error.existingBill = result.existingBill ?? null;
    throw error;
  }
  return result;
}
