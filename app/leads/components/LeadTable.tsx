"use client";

import { Check, Copy } from "lucide-react";

type LeadRow = Record<string, unknown>;
type EnrichSegment = "A" | "B" | "C";

interface AvailableColumn {
  key: string;
  label: string;
  fillRate: number;
}

interface EnrichedLeadResult {
  lead_id: string;
  segment: EnrichSegment;
  priority_score: number;
  pain_point: string;
  suggested_message: string;
  error?: string;
  db_error?: string;
}

interface LeadTableProps {
  rows: LeadRow[];
  visibleColumns: string[];
  availableColumns: Array<{ key: string; label: string; fillRate: number }>;
  enrichedResults: Array<EnrichedLeadResult | null>;
  copiedRowIndex: number | null;
  onToggleColumn: (columnKey: string) => void;
  onCopyMessage: (message: string, rowIndex: number) => void;
  handleSelectAllColumns: () => void;
  handleDeselectAllColumns: () => void;
}

const SEGMENT_BADGE_STYLE: Record<EnrichSegment, React.CSSProperties> = {
  A: { background: "#dcfce7", color: "#15803d", border: "1px solid #86efac" },
  B: { background: "#fef9c3", color: "#a16207", border: "1px solid #fde047" },
  C: { background: "#e2e8f0", color: "#475569", border: "1px solid #cbd5e1" },
};

function SegmentBadge({ segment }: { segment: EnrichSegment }) {
  return (
    <span
      style={{
        ...SEGMENT_BADGE_STYLE[segment],
        display: "inline-block",
        padding: "2px 9px",
        fontSize: 12,
        fontWeight: 700,
        borderRadius: 999,
      }}
    >
      {segment}
    </span>
  );
}

export function LeadTable({
  rows,
  visibleColumns,
  availableColumns,
  enrichedResults,
  copiedRowIndex,
  onToggleColumn,
  onCopyMessage,
  handleSelectAllColumns,
  handleDeselectAllColumns,
}: LeadTableProps) {
  return (
    <>
      <section className="panel">
        <details open>
          <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#405166" }}>
            Sütunları Yönet
          </summary>
          {availableColumns.length > 0 ? (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #eee" }}>
                <button
                  type="button"
                  onClick={handleSelectAllColumns}
                  style={{ fontSize: 12, padding: "4px 8px", background: "#e0f2fe", border: "1px solid #bae6fd", borderRadius: 4, cursor: "pointer" }}
                >
                  Tümünü Seç
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllColumns}
                  style={{ fontSize: 12, padding: "4px 8px", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 4, cursor: "pointer" }}
                >
                  Tümünü Kaldır
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {availableColumns.map((col) => (
                  <label key={col.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(col.key)}
                      onChange={() => onToggleColumn(col.key)}
                    />
                    <span style={{ fontSize: 13 }}>{col.label}</span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <p style={{ marginTop: 10, fontSize: 13, color: "#405166" }}>
              Gösterilecek dolu sütun yok.
            </p>
          )}
        </details>
      </section>

      <section className="panel">
        <h2>Yüklenen Veriler</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {visibleColumns.length > 0 ? (
                  visibleColumns.map((column) => (
                    <th key={column} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #d1d8e0" }}>
                      {availableColumns.find((availableColumn) => availableColumn.key === column)?.label ?? column}
                    </th>
                  ))
                ) : (
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #d1d8e0" }}>Sütun</th>
                )}
                {enrichedResults.length > 0 ? (
                  <>
                    <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #d1d8e0" }}>Segment</th>
                    <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #d1d8e0" }}>Skor</th>
                    <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #d1d8e0" }}>Önerilen Mesaj</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((row, rowIndex) => {
                  const enriched = enrichedResults[rowIndex] ?? null;

                  return (
                    <tr key={rowIndex}>
                      {visibleColumns.map((column) => (
                        <td key={column} style={{ padding: 8, borderBottom: "1px solid #eef1f4" }}>
                          {String(row[column] ?? "")}
                        </td>
                      ))}
                      {enrichedResults.length > 0 ? (
                        <>
                          <td style={{ padding: 8, borderBottom: "1px solid #eef1f4" }}>
                            {enriched ? <SegmentBadge segment={enriched.segment} /> : "—"}
                          </td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eef1f4" }}>
                            {enriched ? enriched.priority_score : "—"}
                          </td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eef1f4", maxWidth: 360 }}>
                            {enriched ? (
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                                <span style={{ fontSize: 13 }}>
                                  {enriched.suggested_message || "Mesaj üretilemedi."}
                                </span>
                                {enriched.suggested_message ? (
                                  <button
                                    type="button"
                                    className="secondary-button"
                                    style={{ padding: "4px 6px", flexShrink: 0 }}
                                    onClick={() => onCopyMessage(enriched.suggested_message, rowIndex)}
                                    aria-label="Mesajı kopyala"
                                  >
                                    {copiedRowIndex === rowIndex ? (
                                      <Check size={14} color="#0f766e" />
                                    ) : (
                                      <Copy size={14} />
                                    )}
                                  </button>
                                ) : null}
                              </div>
                            ) : (
                              "—"
                            )}
                            {copiedRowIndex === rowIndex ? (
                              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: "#0f766e" }}>
                                Kopyalandı!
                              </div>
                            ) : null}
                          </td>
                        </>
                      ) : null}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td style={{ padding: 24, textAlign: "center", color: "#405166" }}>
                    Görüntülenecek veri yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
