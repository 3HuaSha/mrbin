const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

export async function handleOcrTicket(req, res, bodyBuffer) {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const env = globalThis.process?.env || {};
    const apiKey = env.GOOGLE_CLOUD_VISION_API_KEY || env.GOOGLE_VISION_API_KEY;
    if (!apiKey) {
      sendJson(res, 500, { error: "Missing GOOGLE_CLOUD_VISION_API_KEY" });
      return;
    }

    const payload = bodyBuffer?.length ? JSON.parse(bodyBuffer.toString("utf8")) : {};
    const imageContent = await getImageContent(payload);
    if (!imageContent) {
      sendJson(res, 400, { error: "Missing imageUrl or imageBase64" });
      return;
    }

    const response = await fetch(`${VISION_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageContent },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      sendJson(res, response.status, { error: `Google Vision OCR failed: ${detail.slice(0, 500)}` });
      return;
    }

    const data = await response.json();
    const result = data?.responses?.[0];
    if (result?.error) {
      sendJson(res, 422, { error: result.error.message || "Google Vision OCR returned an error" });
      return;
    }

    const rawText = result?.fullTextAnnotation?.text || result?.textAnnotations?.[0]?.description || "";
    const parsed = parseDumpTicket(rawText);
    sendJson(res, 200, {
      ...parsed,
      rawText,
    });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

async function getImageContent(payload) {
  if (typeof payload.imageBase64 === "string" && payload.imageBase64.trim()) {
    return cleanBase64(payload.imageBase64);
  }

  if (typeof payload.imageUrl !== "string" || !payload.imageUrl.trim()) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(payload.imageUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Could not fetch uploaded image: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("base64");
  } finally {
    clearTimeout(timeout);
  }
}

function cleanBase64(value) {
  return value.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "").trim();
}

export function parseDumpTicket(rawText) {
  const text = normalizeOcrText(rawText);
  const upper = text.toUpperCase();

  const lr = matchOne(text, [
    /\bLR\s*[:#]?\s*#?\s*(\d{4,8})\b/i,
    /\bLR\s*#\s*(\d{4,8})\b/i,
  ]);
  if (lr) return buildResult("LR", `LR${lr}`, null);

  const mapleWaste = matchOne(text, [
    /\bTICKET\s*(?:NO\.?|#)?\s*:?\s*(\d{5,8})\b/i,
    /\b(?:TICKET|RECEIPT)\b[\s\S]{0,40}\b(\d{5,8})\b/i,
    /\b(\d{6})\b/,
  ]);
  if ((upper.includes("MAPLE WASTE") || upper.includes("MAPLEWASTE") || upper.includes("MAPLE")) && mapleWaste) {
    return buildResult("MAPLEWASTE", compact(mapleWaste), extractWeightKg("MAPLEWASTE", text));
  }

  const mrbin = matchOne(text, [
    /\bTICKET\s*#?\s*:?\s*(00\s*\d{3,})\b/i,
    /\b(00\s*\d{3,})\b/,
  ]);
  if (upper.includes("MRBIN") && mrbin) return buildResult("MRBIN", compact(mrbin), extractWeightKg("MRBIN", text));

  const york1 = matchOne(text, [
    /\bTICKET\s*#?\s*:?\s*((?:NU|ME)\s*\d{4,})\b/i,
    /\b((?:NU|ME)\s*\d{4,})\b/i,
  ]);
  if ((upper.includes("YORK1") || upper.includes("YORK")) && york1) {
    return buildResult("YORK1", compact(york1), extractWeightKg("YORK1", text));
  }

  const draglam = matchOne(text, [
    /\bTICKET\s*NO\.?\s*:?\s*(TDW\s*\d{5,})\b/i,
    /\b(TDW\s*\d{5,})\b/i,
  ]);
  if ((upper.includes("DRAGLAM") || upper.includes("WASTE&RECYCLING")) && draglam) {
    return buildResult("DRAGLAM", compact(draglam), extractWeightKg("DRAGLAM", text));
  }

  const fallback = matchOne(text, [
    /\b(TDW\s*\d{5,}|(?:NU|ME)\s*\d{4,}|00\s*\d{3,})\b/i,
    /\bLR\s*[:#]?\s*#?\s*(\d{4,8})\b/i,
  ]);

  if (fallback) {
    const ticket = compact(fallback);
    const type = typeFromTicket(ticket, upper);
    return buildResult(type, ticket.startsWith("LR") ? ticket : ticket, extractWeightKg(type, text));
  }

  return {
    ticketType: "UNKNOWN",
    ticketNumber: null,
    confidence: 0,
    issues: ["ticket_number_not_found"],
  };
}

function normalizeOcrText(value) {
  return String(value || "")
    .replace(/[：]/g, ":")
    .replace(/[＃]/g, "#")
    .replace(/\r/g, "\n");
}

function matchOne(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function compact(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function buildResult(ticketType, ticketNumber, weightKg) {
  return {
    ticketType,
    ticketNumber,
    weightKg,
    confidence: 0.9,
    issues: [],
  };
}

function typeFromTicket(ticket, upperText) {
  if (ticket.startsWith("TDW") || upperText.includes("DRAGLAM")) return "DRAGLAM";
  if (ticket.startsWith("NU") || ticket.startsWith("ME") || upperText.includes("YORK")) return "YORK1";
  if (upperText.includes("MAPLE WASTE") || upperText.includes("MAPLEWASTE") || upperText.includes("MAPLE")) return "MAPLEWASTE";
  if (ticket.startsWith("00") || upperText.includes("MRBIN")) return "MRBIN";
  if (ticket.startsWith("LR") || upperText.includes("LANDSCAPING")) return "LR";
  return "UNKNOWN";
}

function extractWeightKg(ticketType, text) {
  if (ticketType === "MRBIN") {
    return extractSmallestScaleKg(text) ?? extractKgNearLabel(text, ["NET"]) ?? parseKg(matchOne(text, [
      /\bNET\s*:?\s*([0-9][0-9,.\s]*)\s*kg\b/i,
    ]));
  }

  if (ticketType === "YORK1") {
    return extractSmallestScaleKg(text) ?? extractKgNearLabel(text, ["NET WEIGHT", "NET WT", "NET"]) ?? parseKg(matchOne(text, [
      /\bNET\s+WEIGHT\s*:?\s*([0-9][0-9,.\s]*)\s*kg\b/i,
      /\bNET\s*:?\s*([0-9][0-9,.\s]*)\s*kg\b/i,
    ]));
  }

  if (ticketType === "MAPLEWASTE") {
    return extractSmallestScaleKg(text) ?? extractKgNearLabel(text, ["NET WEIGHT", "NET WT", "NET"]) ?? parseKg(matchOne(text, [
      /\bNET\s+WEIGHT\s*(?:\(\s*kg\s*\))?\s*:?\s*([0-9][0-9,.\s]*)\s*(?:kg)?\b/i,
      /\bNET\s+WT\.?\s*(?:\(\s*kg\s*\))?\s*:?\s*([0-9][0-9,.\s]*)\s*(?:kg)?\b/i,
      /\bNET\s*:?\s*([0-9][0-9,.\s]*)\s*kg\b/i,
    ]));
  }

  if (ticketType === "DRAGLAM") {
    const netKg = extractSmallestScaleKg(text) ?? extractKgNearLabel(text, ["NET"]);
    if (netKg != null) return netKg;

    const ton = parseNumber(matchOne(text, [
      /\bQUANTITY\s*:?\s*([0-9][0-9,.\s]*)\b/i,
      /\bQTY\.?\s*:?\s*([0-9][0-9,.\s]*)\b/i,
    ]));
    return ton == null ? null : Math.round(ton * 1000);
  }

  return null;
}

function extractSmallestScaleKg(text) {
  const values = extractScaleKgValues(text);
  return values.length ? Math.min(...values) : null;
}

function extractScaleKgValues(text) {
  const normalized = String(text || "").replace(/\r/g, "\n");
  if (!/\b(?:GROSS|TARE|NET|WEIGHT|WT)\b/i.test(normalized)) return [];

  const values = [];
  const kgMatches = normalized.matchAll(/\b([0-9][0-9,.\s]{1,12})\s*kg\b/gi);
  for (const match of kgMatches) {
    const value = parseKg(match[1]);
    if (value != null && value >= 50 && value <= 60000) values.push(value);
  }

  if (values.length >= 2) return [...new Set(values)];

  const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const labelLineIndex = lines.findIndex((line) => /\b(?:GROSS|TARE|NET)(?:\s+WEIGHT|\s+WT)?\b/i.test(line));
  if (labelLineIndex >= 0) {
    const nearby = lines.slice(labelLineIndex, labelLineIndex + 8).join(" ");
    for (const value of parseReasonableKgList(nearby)) values.push(value);
  }

  return values.length >= 2 ? [...new Set(values)] : [];
}

function extractKgNearLabel(text, labels) {
  const normalized = String(text || "").replace(/\r/g, "\n");
  const tableValue = extractKgFromScaleTable(normalized, labels);
  if (tableValue != null) return tableValue;

  const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (const label of labels) {
    const escaped = label.split(/\s+/).map(escapeRegex).join("\\s+");
    const linePattern = new RegExp(`\\b${escaped}\\b`, "i");
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(linePattern);
      if (!match) continue;
      const sameLine = parseReasonableKg(lines[i].slice((match.index || 0) + match[0].length));
      if (sameLine != null) return sameLine;

      for (let offset = 1; offset <= 3 && i + offset < lines.length; offset += 1) {
        const nextLine = lines[i + offset];
        if (/\b(?:GROSS|TARE|TICKET|DATE|TIME|PHONE)\b/i.test(nextLine)) continue;
        const value = parseReasonableKg(nextLine);
        if (value != null) return value;
      }
    }
  }
  return null;
}

function extractKgFromScaleTable(text, labels) {
  if (!labels.some((label) => /^NET(?:\s+WEIGHT|\s+WT)?$/i.test(label))) return null;
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const weightLabelIndexes = [];
  for (let i = 0; i < lines.length; i += 1) {
    const matches = [...lines[i].matchAll(/\b(GROSS(?:\s+WEIGHT)?|TARE(?:\s+WEIGHT)?|NET(?:\s+WEIGHT|\s+WT)?)\b/gi)];
    for (const match of matches) {
      const label = match[1].toUpperCase();
      weightLabelIndexes.push({
        kind: label.startsWith("GROSS") ? "gross" : label.startsWith("TARE") ? "tare" : "net",
        index: i,
        end: (match.index || 0) + match[0].length,
      });
    }
  }

  const netOrdinal = weightLabelIndexes.findIndex((item) => item.kind === "net");
  if (netOrdinal < 0 || weightLabelIndexes.length < 2) return null;

  const lastLabelIndex = Math.max(...weightLabelIndexes.map((item) => item.index));
  const sameLineLabels = weightLabelIndexes.filter((item) => item.index === lastLabelIndex);
  if (sameLineLabels.length >= 2) {
    const valuesOnSameLine = parseReasonableKgList(lines[lastLabelIndex].slice(Math.max(...sameLineLabels.map((item) => item.end))));
    if (valuesOnSameLine.length >= weightLabelIndexes.length) return valuesOnSameLine[netOrdinal] ?? null;
  }

  const values = [];
  for (let i = lastLabelIndex + 1; i < Math.min(lines.length, lastLabelIndex + 10); i += 1) {
    if (/\b(?:TICKET|DATE|TIME|PHONE|ADDRESS)\b/i.test(lines[i])) break;
    const value = parseReasonableKg(lines[i]);
    if (value != null) values.push(value);
  }

  return values[netOrdinal] ?? null;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseKg(value) {
  const parsed = parseNumber(value);
  return parsed == null ? null : Math.round(parsed);
}

function parseReasonableKg(value) {
  return parseReasonableKgList(value)[0] ?? null;
}

function parseReasonableKgList(value) {
  const matches = String(value || "").match(/[0-9][0-9,.\s]{1,12}/g) || [];
  const values = [];
  for (const match of matches) {
    const parsed = parseKg(match);
    if (parsed != null && parsed >= 50 && parsed <= 60000) values.push(parsed);
  }
  return values;
}

function parseNumber(value) {
  if (!value) return null;
  const cleaned = String(value).replace(/\s+/g, "").replace(/,/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
