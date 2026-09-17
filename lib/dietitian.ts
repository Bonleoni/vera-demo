export interface DietitianLead {
  id: string;
  name: string | null;
  title: string | null;
  unvan: string | null;
  category: string | null;
  address: string | null;
  location: string | null;
  city: string | null;
  phone: string | null;
  rating: number | null;
  review_count: number | null;
  website: string | null;
  instagram: string | null;
  customer_review: string | null;
  google_maps_url: string | null;
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

export function normalizeDietitianLead(row: Record<string, unknown>, fallbackId: string): DietitianLead {
  return {
    id: asString(row.id) ?? fallbackId,
    name: asString(row.name),
    title: asString(row.title),
    unvan: asString(row.unvan),
    category: asString(row.category),
    address: asString(row.address),
    location: asString(row.location) ?? asString(row.city),
    city: asString(row.city),
    phone: asString(row.phone),
    rating: asNumber(row.rating),
    review_count: asNumber(row.review_count),
    website: asString(row.website),
    instagram: asString(row.instagram),
    customer_review: asString(row.customer_review),
    google_maps_url: asString(row.google_maps_url),
  };
}

export function getDietitianTitle(lead: DietitianLead): string {
  return lead.title || lead.unvan || lead.category || "Diyetisyen";
}

export function getDietitianLocationLabel(lead: DietitianLead): string {
  const location = lead.location || lead.city;
  if (!location) return "İstanbul";
  if (/istanbul/i.test(location)) return location;
  return `${location}, İstanbul`;
}

export const DEMO_DIETITIAN_LEAD: DietitianLead = {
  id: "demo",
  name: "Ayşe Yılmaz",
  title: "Uzman Diyetisyen",
  unvan: "Uzman Diyetisyen",
  category: "Diyetisyen",
  address: "Bağdat Caddesi No:128, Kadıköy, İstanbul",
  location: "Kadıköy",
  city: "İstanbul",
  phone: "+905551112233",
  rating: 4.8,
  review_count: 124,
  website: "https://example.com",
  instagram: "https://instagram.com/example",
  customer_review: "Çok ilgili ve açıklayıcı bir diyet programı hazırladı. Randevu süreci de çok düzenliydi.",
  google_maps_url: "https://maps.google.com/?q=Kadikoy+Istanbul",
};
