// GET /api/credits  ->  SunoAPI GET /generate/credit
import { suno, json, checkPassword } from "../lib/suno.mjs";

export default async (req) => {
  const denied = checkPassword(req);
  if (denied) return denied;
  return json(await suno("/generate/credit"));
};

export const config = { path: "/api/credits" };
