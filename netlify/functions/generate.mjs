// POST /api/generate  ->  SunoAPI POST /generate
import { suno, json, checkPassword, callbackUrl } from "../lib/suno.mjs";

const MODELS = ["V6", "V6_WILD", "V6_MINI"];

export default async (req) => {
  if (req.method !== "POST") return json({ code: 405, msg: "Use POST." }, 405);
  const denied = checkPassword(req);
  if (denied) return denied;

  let input;
  try {
    input = await req.json();
  } catch {
    return json({ code: 400, msg: "Body must be JSON." }, 400);
  }

  const customMode = Boolean(input.customMode);
  const instrumental = Boolean(input.instrumental);
  const model = MODELS.includes(input.model) ? input.model : "V6";
  const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

  const body = { customMode, instrumental, model, callBackUrl: callbackUrl() };

  if (customMode) {
    // Custom mode: title/style/lyrics and the fine-tuning knobs.
    const title = str(input.title, 80);
    const style = str(input.style, 1000);
    const lyrics = instrumental ? "" : str(input.lyrics, 5000);
    const negativeTags = str(input.negativeTags, 1000);
    if (!style && !lyrics && !negativeTags) {
      return json({ code: 400, msg: "Custom mode needs a style, lyrics, or tags to avoid." }, 400);
    }
    if (title) body.title = title;
    if (style) body.style = style;
    if (lyrics) body.lyrics = lyrics;
    if (negativeTags) body.negativeTags = negativeTags;
    if (input.vocalGender === "m" || input.vocalGender === "f") body.vocalGender = input.vocalGender;

    const dur = Number(input.duration);
    if (Number.isFinite(dur) && dur >= 10 && dur <= 360) body.duration = Math.round(dur);

    for (const k of ["styleWeight", "weirdnessConstraint"]) {
      const n = Number(input[k]);
      if (input[k] !== undefined && input[k] !== "" && Number.isFinite(n)) {
        body[k] = Math.min(1, Math.max(0, Math.round(n * 100) / 100));
      }
    }
    const variety = Number(input.variety);
    if (Number.isInteger(variety) && variety >= 0 && variety <= 4) body.variety = variety;
  } else {
    // Simple mode: describe the song, Suno writes the lyrics.
    const prompt = str(input.prompt, 3000);
    const style = str(input.style, 1000);
    // V6 rejects non-custom requests that have no style/lyrics/media, so a
    // style is required here even when a prompt is given.
    if (!style) {
      return json({ code: 400, msg: "Add a style or genre (e.g. \"lo-fi, chill\")." }, 400);
    }
    if (prompt) body.prompt = prompt;
    if (style) body.style = style;
  }

  const result = await suno("/generate", { method: "POST", body });
  return json(result, result.code === 200 ? 200 : 502);
};

export const config = { path: "/api/generate" };
