import express from "express";
import cors from "cors";
import pg from "pg";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const TRACKER_API_KEY = process.env.TRACKER_API_KEY || "";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(express.json({ limit: "50kb" }));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error("Origin not allowed"));
  }
}));

function cleanText(value, max = 1000) {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, max);
}

function validPincode(pin) {
  return /^[0-9]{6}$/.test(String(pin || ""));
}

function requireTrackerKey(req, res, next) {
  if (!TRACKER_API_KEY || req.get("x-tracker-key") !== TRACKER_API_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  next();
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="Pincode Dashboard"');
    return res.status(401).send("Authentication required");
  }

  const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  const user = separator >= 0 ? decoded.slice(0, separator) : "";
  const pass = separator >= 0 ? decoded.slice(separator + 1) : "";

  const userOk = crypto.timingSafeEqual(
    Buffer.from(user),
    Buffer.from(ADMIN_USER)
  );
  const passOk = crypto.timingSafeEqual(
    Buffer.from(pass),
    Buffer.from(ADMIN_PASSWORD)
  );

  if (!userOk || !passOk) {
    res.set("WWW-Authenticate", 'Basic realm="Pincode Dashboard"');
    return res.status(401).send("Invalid credentials");
  }

  next();
}

app.post("/api/track", requireTrackerKey, async (req, res) => {
  try {
    const {
      pincode,
      result,
      delivery_type,
      delivery_date,
      product_id,
      product_handle,
      variant_id,
      page_url,
      session_id
    } = req.body || {};

    if (!validPincode(pincode)) {
      return res.status(400).json({ ok: false, error: "Invalid pincode" });
    }

    const allowedResults = new Set(["serviceable", "unavailable", "error"]);
    if (!allowedResults.has(String(result))) {
      return res.status(400).json({ ok: false, error: "Invalid result" });
    }

    const query = `
      INSERT INTO pincode_searches
      (pincode, result, delivery_type, delivery_date, product_id,
       product_handle, variant_id, page_url, session_id, user_agent)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id
    `;

    const values = [
      String(pincode),
      String(result),
      cleanText(delivery_type, 30),
      cleanText(delivery_date, 100),
      cleanText(product_id, 100),
      cleanText(product_handle, 255),
      cleanText(variant_id, 100),
      cleanText(page_url, 2000),
      cleanText(session_id, 100),
      cleanText(req.get("user-agent"), 1000)
    ];

    const saved = await pool.query(query, values);

    res.status(201).json({ ok: true, id: saved.rows[0].id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Database error" });
  }
});

app.get("/api/dashboard/summary", requireAdmin, async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days || 30), 1), 365);
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int AS total_searches,
        COUNT(DISTINCT pincode)::int AS unique_pincodes,
        COUNT(*) FILTER (WHERE result = 'serviceable')::int AS serviceable,
        COUNT(*) FILTER (WHERE result = 'unavailable')::int AS unavailable,
        COUNT(*) FILTER (WHERE result = 'error')::int AS errors,
        COUNT(*) FILTER (WHERE delivery_type = 'express')::int AS express,
        COUNT(*) FILTER (WHERE delivery_type = 'standard')::int AS standard
      FROM pincode_searches
      WHERE created_at >= NOW() - ($1::text || ' days')::interval
    `, [days]);

    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/dashboard/top-pincodes", requireAdmin, async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days || 30), 1), 365);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);

    const { rows } = await pool.query(`
      SELECT
        pincode,
        COUNT(*)::int AS searches,
        COUNT(*) FILTER (WHERE result = 'serviceable')::int AS serviceable,
        COUNT(*) FILTER (WHERE result = 'unavailable')::int AS unavailable,
        COUNT(*) FILTER (WHERE result = 'error')::int AS errors
      FROM pincode_searches
      WHERE created_at >= NOW() - ($1::text || ' days')::interval
      GROUP BY pincode
      ORDER BY searches DESC, pincode ASC
      LIMIT $2
    `, [days, limit]);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/dashboard/recent", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);

    const { rows } = await pool.query(`
      SELECT
        id, pincode, result, delivery_type, delivery_date,
        product_handle, variant_id, page_url, created_at
      FROM pincode_searches
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/dashboard/export", requireAdmin, async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days || 30), 1), 365);

    const { rows } = await pool.query(`
      SELECT
        id, pincode, result, delivery_type, delivery_date,
        product_id, product_handle, variant_id, page_url,
        session_id, created_at
      FROM pincode_searches
      WHERE created_at >= NOW() - ($1::text || ' days')::interval
      ORDER BY created_at DESC
    `, [days]);

    const headers = [
      "id","pincode","result","delivery_type","delivery_date",
      "product_id","product_handle","variant_id","page_url",
      "session_id","created_at"
    ];

    const csvEscape = value => {
      const s = value === null || value === undefined ? "" : String(value);
      return `"${s.replaceAll('"', '""')}"`;
    };

    const csv = [
      headers.join(","),
      ...rows.map(row => headers.map(h => csvEscape(row[h])).join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="pincode-searches-${days}d.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error(error);
    res.status(500).send("Export failed");
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/dashboard", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Pincode tracking server running on port ${PORT}`);
});