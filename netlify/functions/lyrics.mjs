// POST /api/lyrics  ->  SunoAPI POST /lyrics   (prompt max 200 chars)
// GET  /api/lyrics?taskId=...  ->  SunoAPI GET /lyrics/record-info
import { suno, json, checkPassword, callbackUrl } from "../lib/suno.mjs";

export default async (req) => {
  const denied = checkPassword(req);
  if (denied) return denied;

  if (req.method === "GET") {
    const taskId = new URL(req.url).searchParams.get("taskId");
    if (!taskId) return json({ code: 400, msg: "taskId is required." }, 400);
    return json(await suno(`/lyrics/record-info?taskId=${encodeURIComponent(taskId)}`));
  }

  if (req.method !== "POST") return json({ code: 405, msg: "Use GET or POST." }, 405);
  let input;
  try {
    input = await req.json();
  } catch {
    return json({ code: 400, msg: "Body must be JSON." }, 400);
  }
  const prompt = typeof input.prompt === "string" ? input.prompt.trim().slice(0, 200) : "";
  if (!prompt) return json({ code: 400, msg: "Describe what the lyrics should be about." }, 400);

  const result = await suno("/lyrics", {
    method: "POST",
    body: { prompt, callBackUrl: callbackUrl() },
  });
  return json(result, result.code === 200 ? 200 : 502);
};

export const config = { path: "/api/lyrics" };
