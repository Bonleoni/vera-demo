import { NextResponse } from "next/server";
import OpenAI from "openai";

import { supabase } from "@/lib/supabase";

export type EnrichSegment = "A" | "B" | "C";

export interface EnrichedLeadResult {
  segment: EnrichSegment;
  priority_score: number;
  pain_point: string;
  suggested_message: string;
}

interface LeadRecordWithId {
  id: string;
  created_at?: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  rating: number | null;
  review_count: number | null;
  website: string | null;
  instagram: string | null;
  customer_review: string | null;
  google_maps_url: string | null;
}

interface EnrichRequestBody {
  leads?: LeadRecordWithId[];
}

interface EnrichResultItem extends EnrichedLeadResult {
  lead_id: string;
  error?: string;
  db_error?: string;
}

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

/**
 * DeepSeek/LLM çıktısındaki markdown kod bloklarını (```json ... ```)
 * temizleyip yalnızca saf JSON metnini döndürür.
 */
function cleanupJsonResponse(raw: string): string {
  let text = String(raw ?? "").trim();

  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1).trim();
  }

  return text;
}

function isValidEnrichResult(value: unknown): value is EnrichedLeadResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    (candidate.segment === "A" || candidate.segment === "B" || candidate.segment === "C") &&
    typeof candidate.priority_score === "number" &&
    typeof candidate.pain_point === "string" &&
    typeof candidate.suggested_message === "string"
  );
}

function buildPrompt(lead: LeadRecordWithId): string {
  // Analiz için sadece anlamlı alanları gönder; id/created_at gürültü yaratmasın.
  const analyzable: Omit<LeadRecordWithId, "id" | "created_at"> = {
    name: lead.name,
    phone: lead.phone,
    address: lead.address,
    rating: lead.rating,
    review_count: lead.review_count,
    website: lead.website,
    instagram: lead.instagram,
    customer_review: lead.customer_review,
    google_maps_url: lead.google_maps_url,
  };
  const leadDataString = JSON.stringify(analyzable, null, 2);

  return `Sen uzman bir B2B satış analistisisin. Aşağıdaki diyetisyen verisini analiz et ve SADECE geçerli bir JSON objesi döndür.
Veri: ${leadDataString}
Kurallar:
1. segment: Sadece 'A' (Web ve Insta var, puan 4.5+), 'B' (Sadece biri var), 'C' (Hiçbiri yok veya puan 4.0 altı) olarak belirle.
2. priority_score: 1-10 arası bir sayı ver.
3. pain_point: 'customer_review' alanından diyetisyenin güçlü olduğu temayı 5-10 kelimeyle özetle. Yoksa 'Belirtilmemiş' yaz.
4. suggested_message: Bu diyetisyene atılacak, iltifat içeren, 'randevu dönüşüm ajansı' hizmetimizi teklif eden, maksimum 3 cümlelik kişiselleştirilmiş Türkçe bir WhatsApp/DM mesajı yaz. Mesajda [İsim] değişkenini kullan.

Yanıtını SADECE şu formatta ver, başka hiçbir açıklama veya markdown ekleme:
{"segment": "A" | "B" | "C", "priority_score": number, "pain_point": string, "suggested_message": string}`;
}

async function callDeepSeekForLead(
  lead: LeadRecordWithId,
): Promise<EnrichedLeadResult & { error?: string }> {
  try {
    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      temperature: 0,
      messages: [
        {
          role: "user",
          content: buildPrompt(lead),
        },
      ],
    });

    const rawText = completion.choices[0]?.message?.content ?? "";
    const cleaned = cleanupJsonResponse(rawText);

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("AI yanıtı geçerli bir JSON olarak ayrıştırılamadı.");
    }

    if (!isValidEnrichResult(parsed)) {
      throw new Error("AI yanıtı beklenen alanları içermiyor.");
    }

    return parsed;
  } catch (error) {
    return {
      segment: "C",
      priority_score: 0,
      pain_point: "Belirtilmemiş",
      suggested_message: "",
      error:
        error instanceof Error
          ? error.message
          : "Lead zenginleştirilirken bilinmeyen bir hata oluştu.",
    };
  }
}

/**
 * Bir lead'i DeepSeek ile analiz eder ve başarılı olursa sonucu
 * `enrichment_results` tablosuna `lead_id` ile ilişkilendirerek kaydeder.
 * AI analizi başarısız olursa veritabanına yazma denemesi yapılmaz.
 */
async function enrichAndPersistLead(lead: LeadRecordWithId): Promise<EnrichResultItem> {
  const analysis = await callDeepSeekForLead(lead);

  if (analysis.error) {
    return {
      lead_id: lead.id,
      segment: analysis.segment,
      priority_score: analysis.priority_score,
      pain_point: analysis.pain_point,
      suggested_message: analysis.suggested_message,
      error: analysis.error,
    };
  }

  const { error: insertError } = await supabase.from("enrichment_results").insert({
    lead_id: lead.id,
    segment: analysis.segment,
    priority_score: analysis.priority_score,
    pain_point: analysis.pain_point,
    suggested_message: analysis.suggested_message,
    analyzed_at: new Date().toISOString(),
  });

  return {
    lead_id: lead.id,
    segment: analysis.segment,
    priority_score: analysis.priority_score,
    pain_point: analysis.pain_point,
    suggested_message: analysis.suggested_message,
    db_error: insertError
      ? `Sonuç veritabanına kaydedilemedi: ${insertError.message}`
      : undefined,
  };
}

export async function POST(request: Request) {
  try {
    if (!process.env.DEEPSEEK_API_KEY) {
      return NextResponse.json(
        { error: "DEEPSEEK_API_KEY yapılandırılmamış." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as EnrichRequestBody;
    const leads = Array.isArray(body.leads) ? body.leads : [];

    if (leads.length === 0) {
      return NextResponse.json(
        { error: "İşlenecek lead verisi bulunamadı." },
        { status: 400 },
      );
    }

    const invalidLead = leads.find((lead) => typeof lead?.id !== "string" || !lead.id);
    if (invalidLead) {
      return NextResponse.json(
        { error: "Her lead için Supabase'den dönen geçerli bir 'id' alanı gereklidir." },
        { status: 400 },
      );
    }

    const results = await Promise.all(
      leads.map((lead) => enrichAndPersistLead(lead)),
    );

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Lead zenginleştirme işlemi sırasında beklenmeyen bir hata oluştu.",
      },
      { status: 500 },
    );
  }
}

