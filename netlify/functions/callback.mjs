// Suno requires a callBackUrl on every task. This app polls /api/status
// instead, so the callback only needs to acknowledge the request.
export default async (req) => {
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("Suno callback:", body?.data?.callbackType, body?.data?.task_id, body?.code);
    } catch {
      /* ignore malformed bodies */
    }
  }
  return new Response(JSON.stringify({ status: "received" }), {
    headers: { "Content-Type": "application/json" },
  });
};
