"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { UploadCloud, FileSpreadsheet, Sparkles, Loader2 } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { LeadTable } from "./components/LeadTable";

type LeadRow = Record<string, unknown>;

interface AvailableColumn {
  key: string;
  label: string;
  fillRate: number;
}

type EnrichSegment = "A" | "B" | "C";

interface EnrichedLeadResult {
  lead_id: string;
  segment: EnrichSegment;
  priority_score: number;
  pain_point: string;
  suggested_message: string;
  error?: string;
  db_error?: string;
}

/** Supabase `leads` tablosu şemasıyla birebir eşleşen normalize edilmiş lead alanları. */
interface LeadInsertPayload {
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

interface LeadRecord extends LeadInsertPayload {
  id: string;
}

/** Excel sütun başlıklarını Supabase `leads` şemasındaki alan adlarına eşlemek için aday isim listesi. */
const COLUMN_ALIASES: Record<keyof LeadInsertPayload, string[]> = {
  name: ["isim", "ad soyad", "ad", "diyetisyen", "diyetisyen adi", "name"],
  rating: ["puan", "rating", "degerlendirme", "yildiz"],
  review_count: ["yorum sayisi", "review count", "review"],
  address: ["adres", "address"],
  phone: ["telefon", "phone", "tel"],
  website: ["web", "website", "site", "web sitesi"],
  instagram: ["instagram", "insta", "ig"],
  customer_review: [
    "musteri yorumu",
    "customer_review",
    "customer review",
    "yorum icerigi",
    "yorum metni",
    "yorum",
  ],
  google_maps_url: ["google maps", "google maps url", "maps url", "harita", "google maps link"],
};

/** Türkçe karakterleri sadeleştirip başlık eşleştirmesini kolaylaştırır. */
function normalizeHeader(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Ham Excel satırını Supabase `leads` tablosuna eklenebilecek normalize edilmiş alanlara dönüştürür. */
function mapRowToLeadPayload(row: LeadRow): LeadInsertPayload {
  const raw: Record<string, unknown> = {};

  for (const [rawKey, value] of Object.entries(row)) {
    const normalizedKey = normalizeHeader(rawKey);
    let matchedField: keyof LeadInsertPayload | null = null;

    for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as Array<
      [keyof LeadInsertPayload, string[]]
    >) {
      if (aliases.some((alias) => normalizedKey === alias || normalizedKey.includes(alias))) {
        matchedField = field;
        break;
      }
    }

    if (matchedField) {
      raw[matchedField] = value;
    }
  }

  const toStringOrNull = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  };

  const toNumberOrNull = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  return {
    name: toStringOrNull(raw.name),
    phone: toStringOrNull(raw.phone),
    address: toStringOrNull(raw.address),
    rating: toNumberOrNull(raw.rating),
    review_count: toNumberOrNull(raw.review_count),
    website: toStringOrNull(raw.website),
    instagram: toStringOrNull(raw.instagram),
    customer_review: toStringOrNull(raw.customer_review),
    google_maps_url: toStringOrNull(raw.google_maps_url),
  };
}

function isFilledValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function calculateAvailableColumns(leadsData: LeadRow[]): AvailableColumn[] {
  if (!leadsData || leadsData.length === 0) return [];

  const labels: Record<string, string> = {
    lead_number: "Lead No",
    name: "Ad Soyad",
    phone: "Telefon",
    city: "Şehir",
    district: "İlçe",
    rating: "Puan",
    review_count: "Yorum Sayısı",
    instagram_url: "Instagram",
    instagram: "Instagram",
    address: "Adres",
  };

  const allKeys = Object.keys(leadsData[0]);
  const total = leadsData.length;

  return allKeys
    .map((key) => {
      const filledCount = leadsData.filter((lead) => isFilledValue(lead[key])).length;
      const fillRate = (filledCount / total) * 100;

      return {
        key,
        label: labels[key] || key.charAt(0).toLocaleUpperCase("tr-TR") + key.slice(1),
        fillRate,
      };
    })
    .filter((column) => column.fillRate >= 10)
    .sort((a, b) => b.fillRate - a.fillRate);
}

export default function LeadsPage() {
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enrichedResults, setEnrichedResults] = useState<Array<EnrichedLeadResult | null>>([]);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [copiedRowIndex, setCopiedRowIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const availableColumns = useMemo(() => calculateAvailableColumns(rows), [rows]);

  useEffect(() => {
    console.log("availableColumns hesaplandı:", availableColumns);
    console.log("GERÇEK RENDER DOSYASI BURASI", { veriSayisi: rows?.length || 0, availableColumns });
    setVisibleColumns(availableColumns.map((column) => column.key));
  }, [availableColumns, rows?.length]);

  useEffect(() => {
    let isMounted = true;

    async function fetchLeads() {
      try {
        const response = await fetch("/api/leads");
        const payload = (await response.json()) as {
          data?: LeadRow[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Lead listesi alınamadı.");
        }

        if (!isMounted) return;

        const nextRows = Array.isArray(payload.data) ? payload.data : [];

        setRows(nextRows);
        setLoadError(null);
      } catch (error) {
        if (!isMounted) return;
        setLoadError(error instanceof Error ? error.message : "Lead listesi alınamadı.");
      }
    }

    fetchLeads();

    return () => {
      isMounted = false;
    };
  }, []);

  const parseWorkbookFile = useCallback((file: File) => {
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        if (!data) {
          throw new Error("Dosya okunamadı.");
        }

        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<LeadRow>(worksheet, { defval: "" });

        setRows(json);
        setFileName(file.name);
        setEnrichedResults([]);
        setEnrichError(null);
      } catch (error) {
        setParseError(
          error instanceof Error ? error.message : "Excel dosyası okunurken bir hata oluştu.",
        );
        setVisibleColumns([]);
        setRows([]);
        setFileName(null);
        setEnrichedResults([]);
      }
    };

    reader.onerror = () => {
      setParseError("Dosya okunurken bir hata oluştu.");
    };

    reader.readAsArrayBuffer(file);
  }, []);

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      parseWorkbookFile(file);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      parseWorkbookFile(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleColumnToggle = (columnKey: string) => {
    setVisibleColumns((current) =>
      current.includes(columnKey)
        ? current.filter((key) => key !== columnKey)
        : [...current, columnKey],
    );
  };

  const handleSelectAllColumns = () => {
    console.log("Tümünü Seç tıklandı");
    console.log("Tümünü Seç tıklandı, mevcut kolonlar:", availableColumns);
    console.log("Kolonlar:", availableColumns.map((column) => column.key));
    setVisibleColumns(availableColumns.map((column) => column.key));
  };

  const handleDeselectAllColumns = () => {
    console.log("Tümünü Kaldır tıklandı");
    setVisibleColumns(["no", "liste", "ad"]);
  };

  const onToggleColumnMenu = () => {
    setIsColumnMenuOpen((current) => !current);
  };

  const handleEnrich = async () => {
    if (rows.length === 0 || isEnriching) {
      return;
    }

    setIsEnriching(true);
    setEnrichError(null);

    try {
      // 1) Excel satırlarını Supabase `leads` şemasına dönüştür ve tabloya kaydet.
      const leadsPayload: LeadInsertPayload[] = rows.map((row) => mapRowToLeadPayload(row));

      const { data: insertedLeads, error: insertError } = await supabase
        .from("leads")
        .insert(leadsPayload)
        .select();

      if (insertError) {
        throw new Error(`Lead'ler Supabase'e kaydedilemedi: ${insertError.message}`);
      }

      const savedLeads = (insertedLeads ?? []) as LeadRecord[];

      if (savedLeads.length !== rows.length) {
        throw new Error("Kaydedilen lead sayısı, yüklenen satır sayısıyla eşleşmiyor.");
      }

      // 2) Kaydedilen lead'leri (id dahil) DeepSeek analiz endpoint'ine gönder.
      const response = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: savedLeads }),
      });

      const payload = (await response.json()) as {
        results?: EnrichedLeadResult[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Zenginleştirme işlemi başarısız oldu.");
      }

      const results = Array.isArray(payload.results) ? payload.results : [];

      // 3) Sonuçları `lead_id` üzerinden orijinal satır sırasına geri eşle.
      const resultsByLeadId = new Map(results.map((result) => [result.lead_id, result]));
      const orderedResults = savedLeads.map((lead) => resultsByLeadId.get(lead.id) ?? null);

      setEnrichedResults(orderedResults);

      const dbErrors = results.filter((result) => result.db_error);
      if (dbErrors.length > 0) {
        setEnrichError(
          `${dbErrors.length} sonuç DeepSeek tarafından üretildi ancak Supabase'e kaydedilirken hata oluştu.`,
        );
      }
    } catch (error) {
      setEnrichError(
        error instanceof Error ? error.message : "Zenginleştirme sırasında beklenmeyen bir hata oluştu.",
      );
    } finally {
      setIsEnriching(false);
    }
  };

  const handleCopyMessage = async (message: string, rowIndex: number) => {
    try {
      await navigator.clipboard.writeText(message);
      setCopiedRowIndex(rowIndex);
      window.setTimeout(() => {
        setCopiedRowIndex((current) => (current === rowIndex ? null : current));
      }, 2000);
    } catch {
      setEnrichError("Mesaj panoya kopyalanamadı.");
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">LEAD ENRICHMENT SYSTEM</div>
        <h1>Lead Zenginleştirme Sistemi</h1>
      </header>

      <main className="app-main">
        <section className="panel">
          <h2>Excel Yükle</h2>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleBrowseClick}
            style={{
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "36px 20px",
              border: `2px dashed ${isDragActive ? "#1f4f82" : "#9babbc"}`,
              background: isDragActive ? "#eaf1fa" : "#f8fafc",
              textAlign: "center",
            }}
          >
            <UploadCloud size={36} color="#405166" />
            <div style={{ fontSize: 14, fontWeight: 600, color: "#10233b" }}>
              Dosyayı buraya sürükleyin veya tıklayarak seçin
            </div>
            <div style={{ fontSize: 12, color: "#405166" }}>Desteklenen formatlar: .xlsx, .xls, .csv</div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileInputChange}
              style={{ display: "none" }}
            />
          </div>

          {fileName ? (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <FileSpreadsheet size={16} color="#405166" />
              <strong>{fileName}</strong>
              <span className="status completed">{rows.length} satır</span>
            </div>
          ) : null}

          {parseError ? <p className="error-text">{parseError}</p> : null}
          {loadError ? <p className="error-text">{loadError}</p> : null}
        </section>

        <LeadTable
          rows={rows}
          visibleColumns={visibleColumns}
          isColumnMenuOpen={isColumnMenuOpen}
          onToggleColumnMenu={onToggleColumnMenu}
          availableColumns={availableColumns}
          enrichedResults={enrichedResults}
          copiedRowIndex={copiedRowIndex}
          onToggleColumn={handleColumnToggle}
          onCopyMessage={handleCopyMessage}
          handleSelectAllColumns={handleSelectAllColumns}
          handleDeselectAllColumns={handleDeselectAllColumns}
        />
        {enrichError ? <p className="error-text">{enrichError}</p> : null}

        <div className="button-row" style={{ justifyContent: "flex-end" }}>
          <button
            type="button"
            className="primary-button"
            disabled={rows.length === 0 || isEnriching}
            onClick={handleEnrich}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            {isEnriching ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
            {isEnriching ? "Yükleniyor..." : "AI ile Zenginleştir"}
          </button>
        </div>
      </main>
    </div>
  );
}
