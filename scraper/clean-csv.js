#!/usr/bin/env node
/**
 * Apify Google Maps CSV çıktısını lead şemasına yaklaştırarak temizler.
 *
 * Kullanım:
 *   node scraper/clean-csv.js [girdi.csv] [cikti.csv]
 *
 * Varsayılan yollar: scraper/input.csv → scraper/output.csv
 */

const fs = require("fs");
const path = require("path");

/**
 * Apify/TR locale koordinatlarını parse eder.
 * Virgüllü ondalıklar ("40,9906") noktaya çevrilir; noktalı değerler aynen kalır.
 */
function parseCoordinate(value) {
  if (value === null || value === undefined || value === "") {
    return NaN;
  }
  if (typeof value === "number") {
    return value;
  }

  const normalized = String(value).trim().replace(",", ".");
  return parseFloat(normalized);
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value).trim().replace(",", ".");
  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : null;
}

function parseOptionalInt(value) {
  const num = parseOptionalNumber(value);
  if (num === null) return null;
  return Math.round(num);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function cleanRow(row) {
  const latitude = parseCoordinate(row["location/lat"] || row["location.lat"] || row.lat || "");
  const longitude = parseCoordinate(row["location/lng"] || row["location.lng"] || row.lng || "");

  return {
    name: firstNonEmpty(row.title, row.name, row.isim),
    phone: firstNonEmpty(row.phoneUnformatted, row.phone, row.telefon),
    address: firstNonEmpty(row.address, row.adres),
    rating: parseOptionalNumber(row.totalScore || row.rating || row.puan),
    review_count: parseOptionalInt(row.reviewsCount || row.review_count || row.reviews),
    website: firstNonEmpty(row.website, row.web),
    instagram: firstNonEmpty(row.instagram, row.insta),
    customer_review: firstNonEmpty(
      row["reviews/0/text"],
      row["reviews/0/textTranslated"],
      row.customer_review,
      row.description,
    ),
    google_maps_url: firstNonEmpty(row.url, row.google_maps_url),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    city: firstNonEmpty(row.city, row.sehir),
    category: firstNonEmpty(row.categoryName, row.category),
  };
}

function parseCsv(text) {
  const input = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (char === "\r") {
      // CRLF: skip the CR; LF will close the row.
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1)
    .filter((values) => values.some((value) => String(value).trim() !== ""))
    .map((values) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = values[index] ?? "";
      });
      return record;
    });
}

function escapeCsvField(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function stringifyCsv(records) {
  if (records.length === 0) return "";

  const headers = Object.keys(records[0]);
  const lines = [headers.map(escapeCsvField).join(",")];

  for (const record of records) {
    lines.push(headers.map((header) => escapeCsvField(record[header])).join(","));
  }

  return `${lines.join("\n")}\n`;
}

function resolveCliPaths(argv) {
  const cwd = process.cwd();
  const inputPath = path.resolve(cwd, argv[2] || path.join("scraper", "input.csv"));
  const outputPath = path.resolve(cwd, argv[3] || path.join("scraper", "output.csv"));
  return { inputPath, outputPath };
}

function main(argv = process.argv) {
  const { inputPath, outputPath } = resolveCliPaths(argv);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Girdi CSV bulunamadı: ${inputPath}`);
  }

  const raw = fs.readFileSync(inputPath, "utf8");
  const rows = parseCsv(raw);
  const cleaned = rows.map(cleanRow);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, stringifyCsv(cleaned), "utf8");

  return { inputPath, outputPath, rowCount: cleaned.length };
}

if (require.main === module) {
  try {
    const result = main();
    console.log(`Temizlendi: ${result.rowCount} satır → ${result.outputPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = {
  parseCoordinate,
  parseOptionalNumber,
  cleanRow,
  parseCsv,
  stringifyCsv,
  main,
};
