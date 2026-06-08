const allowedTypes = new Set(["delivery", "pickup", "swap", "material"]);
const allowedWindows = new Set(["AM", "PM", "custom"]);
const allowedBinSizes = new Set(["14", "20", "40"]);

export async function handleImportBinOrders(req, res, bodyBuffer) {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const payload = bodyBuffer?.length ? JSON.parse(bodyBuffer.toString("utf8")) : {};
    const text = typeof payload.text === "string" ? payload.text : "";
    if (!text.trim()) {
      sendJson(res, 400, { error: "Missing CSV text" });
      return;
    }

    const parsed = await parseWithAi(text);
    sendJson(res, 200, { orders: parsed.map(normalizeOrder).filter(Boolean) });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

async function parseWithAi(text) {
  const env = globalThis.process?.env || {};
  const apiKey = env.AI_KEY || env.ALIYUN_MAAS_API_KEY;
  const baseUrl = (env.AI_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
  const model = env.AI_MODEL || "qwen-plus";

  if (!apiKey) return fallbackParse(text);

  const prompt = `You parse dumpster dispatch sheet rows into strict JSON.
Return ONLY a JSON array. Do not wrap in markdown.

Rules:
- Only include rows with a real order number starting with SOT, SOB, SOA, SOM, or SOV.
- Chinese action "送" means delivery, "换" means swap, "收" means pickup.
- Skip pure gravel, HPB, sand, soil, aggregate, or material rows when there is no bin in the same row.
- If a row includes both a bin and material, import only the bin order. Put the material text in customer_notes if useful.
- If it is a garbage bin / 垃圾桶 / bin, use type from the action and bin_size 14/20/40 when present.
- The database supports bin_size 14, 20, 30, and 40, but use null if the size is material quantity, for example 3YD GRAVEL.
- Use service_date as YYYY-MM-DD, based on the sheet date/time.
- time_window must be AM, PM, or custom. Put exact text like "Before 12PM" or "2-6PM" in time_window_custom when needed.
- Prefer a customer name from the named column if present. Otherwise use empty string.
- Extract a 10-digit North American phone when present.
- Preserve bin_number such as L20-09 or 40-10 when present.
- confidence is 0 to 1. Add issues for missing address, uncertain type, unsupported bin size, or missing date.

Required keys:
source_row, order_number, type, service_date, time_window, time_window_custom, bin_size, bin_type, material_description, bin_number, customer_name, customer_phone, address, customer_notes, confidence, issues

CSV:
${text.slice(0, 60000)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a careful data import parser. Output valid JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("AI 解析超时，请减少一次导入的行数后重试");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI parse failed: ${response.status} ${detail.slice(0, 400)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("AI response missing content");

  const cleaned = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("AI response is not an array");
  return parsed;
}

function normalizeOrder(input) {
  const raw = input || {};
  const orderNumber = String(raw.order_number || "").trim();
  if (!/^(SOT|SOB|SOA|SOM|SOV)/i.test(orderNumber)) return null;

  const type = allowedTypes.has(String(raw.type)) ? raw.type : "delivery";
  if (type === "material") return null;

  const timeWindow = allowedWindows.has(String(raw.time_window)) ? raw.time_window : "custom";
  const binSize = raw.bin_size && allowedBinSizes.has(String(raw.bin_size)) ? String(raw.bin_size) : null;
  const issues = Array.isArray(raw.issues) ? raw.issues.map(String) : [];
  const address = String(raw.address || "").trim();
  const date = normalizeDate(raw.service_date);

  if (!address) issues.push("missing_address");
  if (!date) issues.push("missing_date");

  return {
    source_row: Number(raw.source_row) || 0,
    order_number: orderNumber,
    type,
    service_date: date || todayISO(),
    time_window: timeWindow,
    time_window_custom: raw.time_window_custom ? String(raw.time_window_custom) : null,
    bin_size: binSize,
    bin_type: raw.bin_type ? String(raw.bin_type) : "garbage",
    material_description: null,
    bin_number: raw.bin_number ? String(raw.bin_number).trim() : null,
    customer_name: raw.customer_name ? String(raw.customer_name).trim() : "",
    customer_phone: normalizePhone(raw.customer_phone),
    address,
    customer_notes: raw.customer_notes ? String(raw.customer_notes).trim() : null,
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0.5)),
    issues: [...new Set(issues)],
  };
}

function fallbackParse(text) {
  return text
    .split(/\r?\n/)
    .map((line, idx) => parseLine(line, idx + 1))
    .filter(Boolean);
}

function parseLine(line, row) {
  const cells = parseCsvLine(line).map((v) => v.trim());
  const orderIndex = cells.findIndex((v) => /^(SOT|SOB|SOA|SOM|SOV)\d+/i.test(v));
  if (orderIndex < 0) return null;

  const orderNumber = cells[orderIndex];
  const joined = cells.join(" ");
  const actionIndex = cells.findIndex((v) => ["送", "收", "换"].includes(v));
  const action = actionIndex >= 0 ? cells[actionIndex] : "";
  const product = cells.find((v) => /\b\d+\s*YD\b|垃圾桶|GARBAGE BIN|GRAVEL|HPB|SAND|SOIL/i.test(v)) || "";
  const hasBin = /BIN|垃圾桶/i.test(product) || /\b(14|20|40)\s*YD\b/i.test(product);
  const isPureMaterial = /GRAVEL|HPB|SAND|SOIL|MATERIAL/i.test(product) && !hasBin;
  if (isPureMaterial) return null;

  const address = (actionIndex >= 0 ? cells[actionIndex + 1] : "") || cells.find((v) => /^\s*\d+ .*ON\s+[A-Z][0-9][A-Z]/i.test(v)) || "";
  const phone = cells.find((v) => /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(v)) || "";
  const rawDate = cells.find((v) => /\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[A-Za-z]{3}\s+\d{4}/i.test(v)) || cells[0] || "";
  const binNumber = cells.find((v) => /^[A-Z]?\d{2}-\d{2}$/i.test(v)) || null;
  const sizeMatch = product.match(/\b(14|20|40)\s*YD\b/i);
  const timeText = cells.find((v) => /AM|PM|BEFORE|NOON|\d{1,2}\s*-\s*\d{1,2}/i.test(v) && !/^[A-Z]?\d{2}-\d{2}$/i.test(v)) || "";

  return {
    source_row: row,
    order_number: orderNumber,
    type: action === "收" ? "pickup" : action === "换" ? "swap" : "delivery",
    service_date: normalizeDate(rawDate) || todayISO(),
    time_window: /BEFORE|NOON|\d{1,2}\s*-\s*\d{1,2}|,/i.test(timeText) ? "custom" : /PM/i.test(timeText) && !/AM/i.test(timeText) ? "PM" : "AM",
    time_window_custom: timeText || null,
    bin_size: sizeMatch?.[1] || null,
    bin_type: "garbage",
    material_description: null,
    bin_number: binNumber,
    customer_name: cells[orderIndex + 3] && !/\d/.test(cells[orderIndex + 3]) ? cells[orderIndex + 3] : "",
    customer_phone: normalizePhone(phone),
    address,
    customer_notes: joined.includes("DRIVEWAY") ? "DRIVEWAY" : null,
    confidence: 0.65,
    issues: address ? [] : ["missing_address"],
  };
}

function parseCsvLine(line) {
  if (line.includes("\t")) return line.split("\t");

  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if ((ch === "," || ch === "\t") && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const parsed = new Date(text.replace(/-/g, " "));
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length !== 10) return "";
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Length", Buffer.byteLength(text));
  res.end(text);
}
