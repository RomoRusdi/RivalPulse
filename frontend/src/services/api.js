const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:8000";

console.log(
  "[RivalPulse] API:",
  API_BASE_URL
);

async function parseResponse(response) {
  const contentType =
    response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return {
    message: await response.text(),
  };
}

export async function sendChatMessage({
  message,
  history = [],
  previousResult = null,
}) {
  console.log(
    "[RivalPulse] Sending chat:",
    message
  );

  const payload = {
    message,
    history,
    previous_result: previousResult,
  };

  console.log(
    "[RivalPulse] Payload:",
    payload
  );

  let response;

  try {
    response = await fetch(
      `${API_BASE_URL}/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );
  } catch (error) {
    console.error(
      "[RivalPulse] Network error:",
      error
    );

    throw new Error(
      `Cannot connect to RivalPulse backend at ${API_BASE_URL}`
    );
  }

  const data = await parseResponse(response);

  console.log(
    "[RivalPulse] Response:",
    response.status,
    data
  );

  if (!response.ok) {
    const backendMessage =
      data?.detail?.error ||
      data?.detail?.message ||
      data?.message;

    throw new Error(
      backendMessage ||
      `Chat request failed with status ${response.status}`
    );
  }

  return data;
}

export async function runResearch(
  company,
  competitors = []
) {
  const response = await fetch(
    `${API_BASE_URL}/research`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        company,
        competitors,
      }),
    }
  );

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      data?.detail?.error ||
      data?.detail?.message ||
      "Research request failed."
    );
  }

  return data;
}