export async function sendPushNotification({ playerId, title, message, url }) {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "89ccfa0f-7840-4f33-9284-e9d0e44865a9";
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;

  console.log("----------------------------------------");
  console.log(`[ONESIGNAL PUSH NOTIFICATION TRIGGERED]`);
  console.log(`To Player ID: ${playerId || "Broadcast All"}`);
  console.log(`Title: ${title}`);
  console.log(`Message: ${message}`);
  console.log(`URL Path: ${url}`);
  console.log("----------------------------------------");

  if (!apiKey || apiKey === "your-onesignal-rest-api-key-here") {
    console.warn("OneSignal push skipped: ONESIGNAL_REST_API_KEY not configured in .env");
    return { success: false, reason: "REST API Key missing" };
  }

  try {
    const payload = {
      app_id: appId,
      contents: { en: message },
      headings: { en: title },
    };

    if (url) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      payload.url = `${baseUrl}${url}`;
    }

    if (playerId) {
      payload.include_subscription_ids = [playerId];
    } else {
      payload.included_segments = ["All"];
    }

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.errors ? data.errors.join(", ") : "OneSignal error");
    }

    console.log("OneSignal push notification sent successfully:", data);
    return { success: true, data };
  } catch (error) {
    console.error("OneSignal push notification failed:", error.message);
    return { success: false, error: error.message };
  }
}
