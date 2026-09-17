const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { parseCoordinate, cleanRow, parseCsv, main } = require("./clean-csv.js");

test("virgüllü Apify koordinatını noktaya çevirir", () => {
  assert.equal(parseCoordinate("40,9906"), 40.9906);
  assert.equal(parseCoordinate("29,0231"), 29.0231);
  assert.equal(parseCoordinate("-3,14"), -3.14);
});

test("noktalı koordinatı olduğu gibi parse eder", () => {
  assert.equal(parseCoordinate("40.9906"), 40.9906);
  assert.equal(parseCoordinate("-74.2482624"), -74.2482624);
});

test("boş veya geçersiz koordinatta NaN döner", () => {
  assert.ok(Number.isNaN(parseCoordinate("")));
  assert.ok(Number.isNaN(parseCoordinate(null)));
  assert.ok(Number.isNaN(parseCoordinate("abc")));
});

test("cleanRow location/lat ve location/lng virgüllerini düzeltir", () => {
  const cleaned = cleanRow({
    title: "Örnek Diyetisyen",
    "location/lat": "40,9906",
    "location/lng": "29,0231",
    totalScore: "4,8",
    reviewsCount: "12",
  });

  assert.equal(cleaned.name, "Örnek Diyetisyen");
  assert.equal(cleaned.latitude, 40.9906);
  assert.equal(cleaned.longitude, 29.0231);
  assert.equal(cleaned.rating, 4.8);
  assert.equal(cleaned.review_count, 12);
});

test("CLI virgüllü CSV'yi temizleyip yazar", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clean-csv-"));
  const inputPath = path.join(dir, "input.csv");
  const outputPath = path.join(dir, "output.csv");

  fs.writeFileSync(
    inputPath,
    [
      "title,location/lat,location/lng,totalScore,reviewsCount,phone,address,website,url",
      '"Diyet Kliniği","40,9906","29,0231","4,7","21","+905551112233","Kadıköy","https://example.com","https://maps.google.com/?cid=1"',
    ].join("\n"),
    "utf8",
  );

  const result = main(["node", "clean-csv.js", inputPath, outputPath]);
  assert.equal(result.rowCount, 1);

  const output = fs.readFileSync(outputPath, "utf8");
  const [headerLine, dataLine] = output.trim().split("\n");
  const headers = parseCsv(`${headerLine}\n${dataLine}`)[0];

  assert.equal(headers.latitude, "40.9906");
  assert.equal(headers.longitude, "29.0231");
  assert.equal(headers.rating, "4.7");
  assert.equal(headers.name, "Diyet Kliniği");
});
