// GET /api/status?taskId=...  ->  SunoAPI GET /generate/record-info
import { suno, json, checkPassword } from "../lib/suno.mjs";

export default async (req) => {
  const denied = checkPassword(req);
  if (denied) return denied;
  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId) return json({ code: 400, msg: "taskId is required." }, 400);
  const result = await suno(`/generate/record-info?taskId=${encodeURIComponent(taskId)}`);
  return json(result);
};

export const config = { path: "/api/status" };
