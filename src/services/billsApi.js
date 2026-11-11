const SESSION_TOKEN_KEY = "cartsync-atlas-api-token";

export function getSavedAtlasToken() {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY) ?? "";
  } catch (error) {
    console.error("Unable to read the Atlas session token:", error);
    return "";
  }
}

export function saveAtlasToken(token) {
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch (error) {
    console.error("Unable to save the Atlas session token:", error);
    throw new Error("Could not save the token for this browser session.");
  }
}

export function clearAtlasToken() {
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch (error) {
    console.error("Unable to clear the Atlas session token:", error);
    throw new Error("Could not clear the token for this browser session.");
  }
}

export async function fetchAtlasBills(token, search = "", signal) {
  const query = new URLSearchParams();
  if (search.trim()) query.set("search", search.trim());
  const response = await fetch(`/api/bills${query.size ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal
  });
  const result = await readResponse(response);
  return result.bills;
}

export async function saveBillToAtlas(token, transaction) {
  const response = await fetch("/api/bills", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
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
    throw new Error(`Atlas API returned an invalid response (${response.status}).`);
  }
  if (!response.ok) {
    const error = new Error(result.error || `Atlas API request failed (${response.status}).`);
    error.status = response.status;
    error.existingBill = result.existingBill ?? null;
    throw error;
  }
  return result;
}
