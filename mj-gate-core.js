// Server-side key-gate logic. The Firebase key lives ONLY in environment variables
// (MJ_FIREBASE_API_KEY, optional MJ_FIREBASE_PROJECT) and never reaches the browser or the repo.
const PROJECT = () => process.env.MJ_FIREBASE_PROJECT || "keyhe-system";
const API_KEY = () => process.env.MJ_FIREBASE_API_KEY || "";
const base = () => `https://firestore.googleapis.com/v1/projects/${PROJECT()}/databases/(default)/documents`;
const clean = (v, max = 80) => (typeof v === "string" && v.length > 0 && v.length <= max && /^[\w\-.]+$/.test(v) ? v : "");

async function keysBy(field, value) {
  const res = await fetch(`${base()}:runQuery?key=${API_KEY()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "keys" }],
        where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } }
      }
    })
  });
  if (!res.ok) throw new Error(`Key server error (${res.status})`);
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).filter((r) => r.document).map((r) => {
    const f = r.document.fields || {};
    return { device: f.device && f.device.stringValue, expiry: Number((f.expiry && (f.expiry.integerValue ?? f.expiry.doubleValue)) || 0) };
  });
}

async function handle(body) {
  if (!API_KEY()) return { status: 500, json: { ok: false, message: "❌ Server key set nahi hai (MJ_FIREBASE_API_KEY)" } };
  const action = body && body.action;
  const device = clean(body && body.device, 100);
  if (!device) return { status: 400, json: { ok: false, message: "❌ Bad request" } };
  try {
    if (action === "check") {
      const docs = await keysBy("device", device);
      const best = docs.reduce((m, d) => (d.expiry > Date.now() && d.expiry > m ? d.expiry : m), 0);
      return { status: 200, json: { ok: best > 0, expiry: best } };
    }
    if (action === "verify") {
      const key = clean(String(body.key || "").trim().toUpperCase(), 20);
      if (!key) return { status: 200, json: { ok: false, message: "❌ Pehle key daalo" } };
      const docs = await keysBy("key", key);
      if (!docs.length) return { status: 200, json: { ok: false, message: "❌ Invalid key!" } };
      let valid = false, expiry = 0, mine = false;
      docs.forEach((d) => { if (d.expiry > Date.now()) { valid = true; expiry = d.expiry; if (d.device === device) mine = true; } });
      if (!valid) return { status: 200, json: { ok: false, message: "❌ Key expire ho gayi!" } };
      if (!mine) return { status: 200, json: { ok: false, message: "❌ Ye key aapke device ke liye nahi hai!" } };
      const hours = Math.ceil((expiry - Date.now()) / 36e5);
      return { status: 200, json: { ok: true, expiry, key, message: `✅ Key verified! ${hours} ghante valid.` } };
    }
    if (action === "token") {
      const ip = clean(String(body.ip || "unknown"), 60) || "unknown";
      const now = Date.now();
      const token = Math.random().toString(36).slice(2) + now;
      const res = await fetch(`${base()}/tokens/${token}?key=${API_KEY()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: {
          ip: { stringValue: ip }, device: { stringValue: device },
          expiry: { integerValue: String(now + 1440 * 60 * 1000) },
          used: { booleanValue: false }, createdAt: { integerValue: String(now) }
        } })
      });
      if (!res.ok) throw new Error(`Token server error (${res.status})`);
      return { status: 200, json: { ok: true, token, message: "⏳ Ads page pe bhej raha hoon..." } };
    }
    return { status: 400, json: { ok: false, message: "❌ Bad request" } };
  } catch (e) {
    return { status: 502, json: { ok: false, message: `❌ Error: ${(e && e.message) || "Gate server failed"}` } };
  }
}
module.exports = { handle };
