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
  photo_url: string | null;
  photos: unknown;
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

function parseJsonMaybe(value: unknown): unknown {
  if (typeof value !== "string") return value;

  const text = value.trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function asHttpsUrl(value: unknown): string | null {
  const text = asString(value);
  if (!text || !text.startsWith("https://")) return null;
  return text;
}

export function normalizeDietitianLead(row: Record<string, unknown>, fallbackId: string): DietitianLead {
  const photos = parseJsonMaybe(row.photos);

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
    photo_url: asHttpsUrl(row.photo_url) ?? asHttpsUrl(row.photoUrl) ?? extractDietitianPhotoUrl(photos),
    photos,
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

export function getDietitianMapQuery(lead: DietitianLead): string {
  const parts = [lead.address, lead.name, getDietitianLocationLabel(lead)]
    .filter((part): part is string => Boolean(part));

  return parts.join(" ");
}

export function getGoogleMapsEmbedUrl(lead: DietitianLead): string {
  const query = encodeURIComponent(getDietitianMapQuery(lead));
  return `https://www.google.com/maps?q=${query}&output=embed`;
}

export function getGoogleMapsSearchUrl(lead: DietitianLead): string {
  const query = encodeURIComponent(getDietitianMapQuery(lead));
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function extractDietitianPhotoUrl(photos: unknown): string | null {
  const directUrl = asHttpsUrl(photos);
  if (directUrl) return directUrl;

  if (Array.isArray(photos)) {
    for (const photo of photos) {
      const url = extractDietitianPhotoUrl(photo);
      if (url) return url;
    }
    return null;
  }

  if (typeof photos !== "object" || photos === null) {
    return null;
  }

  const photo = photos as Record<string, unknown>;
  const preferredUrl =
    asHttpsUrl(photo.url) ??
    asHttpsUrl(photo.imageUrl) ??
    asHttpsUrl(photo.photoUrl) ??
    asHttpsUrl(photo.src) ??
    asHttpsUrl(photo.original);

  if (preferredUrl) return preferredUrl;

  for (const value of Object.values(photo)) {
    const url = extractDietitianPhotoUrl(value);
    if (url) return url;
  }

  return null;
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
  photo_url: null,
  photos: null,
};
