// Shared helper for talking to SunoAPI.org from Netlify Functions.
// The API key is read from the SUNO_API_KEY environment variable, which you
// set in the Netlify dashboard. It is never sent to the browser.

export const SUNO_BASE = "https://api.sunoapi.org/api/v1";

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// Optional shared password. If APP_PASSWORD is set in Netlify, every request
// must send the same value in the x-app-password header. This stops strangers
// who find your site from spending your Suno credits.
export function checkPassword(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return null;
  if (req.headers.get("x-app-password") === expected) return null;
  return json({ code: 401, msg: "Wrong or missing app password." }, 401);
}

export function callbackUrl() {
  // Netlify sets URL to the site's main address. Suno requires a callback URL
  // even though this app polls for results instead.
  const base = process.env.URL || "https://example.com";
  return `${base}/.netlify/functions/callback`;
}

export async function suno(path, { method = "GET", body } = {}) {
  const key = process.env.SUNO_API_KEY;
  if (!key) {
    return { code: 500, msg: "SUNO_API_KEY is not set in the Netlify environment variables." };
  }
  const res = await fetch(`${SUNO_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { code: res.status, msg: text.slice(0, 300) || res.statusText };
  }
}
