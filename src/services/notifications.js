export async function requestNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export function sendBrowserNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return false;
  }

  try {
    new Notification(title, { body, icon: "/vite.svg" });
    return true;
  } catch (error) {
    console.error("Unable to show browser notification:", error);
    return false;
  }
}
