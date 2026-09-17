import { notFound } from "next/navigation";
import { MapPin, Star } from "lucide-react";

import {
  DEMO_DIETITIAN_LEAD,
  getDietitianLocationLabel,
  getGoogleMapsEmbedUrl,
  getGoogleMapsSearchUrl,
  getDietitianTitle,
  normalizeDietitianLead,
  type DietitianLead,
} from "@/lib/dietitian";

export const dynamic = "force-dynamic";

async function getLead(id: string): Promise<DietitianLead | null> {
  if (id === DEMO_DIETITIAN_LEAD.id) {
    return DEMO_DIETITIAN_LEAD;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  const { supabase } = await import("@/lib/supabase");
  const { data, error } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();

  if (error || !data) {
    return null;
  }

  return normalizeDietitianLead(data as Record<string, unknown>, id);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  const name = lead?.name ?? "Diyetisyen";

  return {
    title: `${name} | Diyetisyen`,
    description: lead?.address
      ? `${name} — ${getDietitianTitle(lead)} — ${lead.address}`
      : `${name} diyetisyen profili`,
  };
}

export default async function DietitianPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);

  if (!lead) {
    notFound();
  }

  const title = getDietitianTitle(lead);
  const locationLabel = getDietitianLocationLabel(lead);
  const displayName = lead.name || "Diyetisyen";
  const mapEmbedUrl = getGoogleMapsEmbedUrl(lead);
  const mapSearchUrl = getGoogleMapsSearchUrl(lead);

  return (
    <div className="min-h-full bg-slate-50">
      <section className="bg-gradient-to-br from-emerald-600 via-green-600 to-teal-700 px-6 py-16 text-white md:px-10 md:py-20">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-2 text-4xl font-bold tracking-tight md:text-5xl">{displayName}</h1>
          <p className="mb-4 text-lg text-emerald-50 md:text-xl">{title}</p>

          {lead.address ? (
            <p
              className="mb-5 inline-flex max-w-2xl items-start gap-2 rounded-xl bg-white/20 px-4 py-3 text-base font-medium text-white shadow-sm backdrop-blur-sm md:text-lg"
              data-testid="hero-address"
            >
              <MapPin className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <span>{lead.address}</span>
            </p>
          ) : null}

          <p className="mb-6 max-w-2xl text-lg text-white/90 md:text-xl">
            {locationLabel} •{" "}
            {lead.rating ? (
              <span className="inline-flex items-center gap-1">
                <Star className="h-4 w-4 fill-yellow-300 text-yellow-300" aria-hidden />
                {lead.rating} ({lead.review_count || 0} yorum)
              </span>
            ) : (
              "Profesyonel hizmet"
            )}
          </p>
        </div>
      </section>

      <main className="mx-auto grid max-w-4xl gap-6 px-6 py-10 md:px-10">
        {lead.customer_review ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Danışan yorumu</h2>
            <p className="text-slate-700">{lead.customer_review}</p>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-6">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Harita</h2>
            {lead.address ? (
              <p className="mb-4 flex items-start gap-2 text-slate-700" data-testid="map-address">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
                <span>{lead.address}</span>
              </p>
            ) : null}
            <a className="text-sm font-medium text-emerald-700 underline" href={mapSearchUrl} rel="noreferrer" target="_blank">
              Google Maps'te aç
            </a>
          </div>
          <iframe
            className="h-80 w-full border-0"
            src={mapEmbedUrl}
            title={`${displayName} harita konumu`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">İletişim</h2>
          <ul className="space-y-2 text-slate-700">
            {lead.address ? <li>Adres: {lead.address}</li> : null}
            {lead.phone ? <li>Telefon: {lead.phone}</li> : null}
            {lead.website ? (
              <li>
                Web:{" "}
                <a className="text-emerald-700 underline" href={lead.website} rel="noreferrer" target="_blank">
                  {lead.website}
                </a>
              </li>
            ) : null}
            <li>
              <a className="text-emerald-700 underline" href={mapSearchUrl} rel="noreferrer" target="_blank">
                Google Maps'te aç
              </a>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
