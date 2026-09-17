import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getDietitianLocationLabel,
  getDietitianTitle,
  normalizeDietitianLead,
} from "./dietitian.ts";

test("unvan yoksa Diyetisyen başlığını kullanır", () => {
  const lead = normalizeDietitianLead({ name: "Ayşe" }, "1");
  assert.equal(getDietitianTitle(lead), "Diyetisyen");
});

test("konum etiketine İstanbul ekler", () => {
  const lead = normalizeDietitianLead({ location: "Kadıköy" }, "1");
  assert.equal(getDietitianLocationLabel(lead), "Kadıköy, İstanbul");
});

test("adres alanını olduğu gibi korur", () => {
  const lead = normalizeDietitianLead(
    { address: "Bağdat Caddesi No:128, Kadıköy, İstanbul" },
    "1",
  );
  assert.equal(lead.address, "Bağdat Caddesi No:128, Kadıköy, İstanbul");
});
