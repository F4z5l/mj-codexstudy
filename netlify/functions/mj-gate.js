// Vercel serverless function -> POST /api/mj-gate
const { handle } = require("../mj-gate-core.js");
module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ ok: false, message: "POST only" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const out = await handle(body || {});
  res.status(out.status).json(out.json);
};
