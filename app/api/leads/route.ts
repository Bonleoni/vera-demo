import { NextResponse } from "next/server";

import { supabase } from "@/lib/supabase";

type LeadRecord = Record<string, unknown>;

interface AvailableColumn {
  key: string;
  label: string;
  fillRate: number;
}

const COLUMN_LABELS: Record<string, string> = {
  id: "ID",
  lead_number: "Lead No",
  name: "Ad",
  phone: "Telefon",
  address: "Adres",
  rating: "Puan",
  review_count: "Yorum Sayısı",
  website: "Web Sitesi",
  instagram: "Instagram",
  customer_review: "Müşteri Yorumu",
  google_maps_url: "Google Maps",
  photo_url: "Fotoğraf",
  photos: "Fotoğraflar",
  location: "Konum",
  city: "Şehir",
  category: "Kategori",
};

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function getColumnLabel(key: string): string {
  if (COLUMN_LABELS[key]) return COLUMN_LABELS[key];

  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1))
    .join(" ");
}

function getAvailableColumns(rows: LeadRecord[]): AvailableColumn[] {
  if (rows.length === 0) return [];

  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  return keys
    .map((key) => {
      const filledCount = rows.filter((row) => isFilled(row[key])).length;
      const fillRate = (filledCount / rows.length) * 100;

      return {
        key,
        label: getColumnLabel(key),
        fillRate: Math.round(fillRate),
        isAvailable: fillRate > 10,
      };
    })
    .filter((column) => column.isAvailable)
    .map(({ isAvailable, ...column }) => column);
}

export async function GET() {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("lead_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const leads = (data ?? []) as LeadRecord[];

  return NextResponse.json({
    data: leads,
    availableColumns: getAvailableColumns(leads),
  });
}
