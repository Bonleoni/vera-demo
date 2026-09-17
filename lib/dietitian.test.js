const { test } = require("node:test");
const assert = require("node:assert/strict");

test("diyetisyen yardımcıları adres ve harita URL'lerini doğru üretir", async () => {
  const {
    DEMO_DIETITIAN_LEAD,
    getDietitianLocationLabel,
    getDietitianMapQuery,
    getDietitianTitle,
    getGoogleMapsEmbedUrl,
    getGoogleMapsSearchUrl,
    normalizeDietitianLead,
  } = await import("./dietitian.ts");

  const lead = normalizeDietitianLead(
    { name: "Ayşe", address: "Bağdat Caddesi No:128, Kadıköy, İstanbul", location: "Kadıköy" },
    "1",
  );

  assert.equal(getDietitianTitle(normalizeDietitianLead({ name: "Ayşe" }, "1")), "Diyetisyen");
  assert.equal(getDietitianLocationLabel(lead), "Kadıköy, İstanbul");
  assert.equal(lead.address, "Bağdat Caddesi No:128, Kadıköy, İstanbul");
  assert.equal(
    getDietitianMapQuery(DEMO_DIETITIAN_LEAD),
    "Bağdat Caddesi No:128, Kadıköy, İstanbul Ayşe Yılmaz Kadıköy, İstanbul",
  );

  const embedUrl = getGoogleMapsEmbedUrl(DEMO_DIETITIAN_LEAD);
  const searchUrl = getGoogleMapsSearchUrl(DEMO_DIETITIAN_LEAD);

  assert.match(embedUrl, /^https:\/\/www\.google\.com\/maps\?q=/);
  assert.match(embedUrl, /output=embed$/);
  assert.match(decodeURIComponent(embedUrl), /Bağdat Caddesi No:128/);
  assert.match(searchUrl, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
});

test("photos JSONB içinden sadece geçerli https fotoğraf URL'si çıkarır", async () => {
  const { extractDietitianPhotoUrl, normalizeDietitianLead } = await import("./dietitian.ts");

  assert.equal(
    extractDietitianPhotoUrl([{ url: "" }, { imageUrl: "http://example.com/foto.jpg" }, { photoUrl: "https://lh3.googleusercontent.com/photo" }]),
    "https://lh3.googleusercontent.com/photo",
  );
  assert.equal(extractDietitianPhotoUrl(undefined), null);
  assert.equal(extractDietitianPhotoUrl(""), null);
  assert.equal(extractDietitianPhotoUrl("http://example.com/foto.jpg"), null);

  const lead = normalizeDietitianLead(
    { photos: JSON.stringify([{ url: "https://storage.googleapis.com/bucket/profile.jpg" }]) },
    "1",
  );

  assert.equal(lead.photo_url, "https://storage.googleapis.com/bucket/profile.jpg");
});
