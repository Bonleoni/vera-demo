"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type LeadRow = Record<string, unknown>;

export interface AvailableColumn {
  key: string;
  label: string;
  fillRate: number;
}

export function useLeadsData() {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(["no", "liste", "ad"]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableColumns = useMemo(() => {
    if (!rows || rows.length === 0) return [];

    const total = rows.length;
    const allKeys = Object.keys(rows[0]);

    return allKeys
      .map((key) => {
        const filledCount = rows.filter((row) => row[key] !== null && row[key] !== undefined && row[key] !== "").length;
        const fillRate = (filledCount / total) * 100;
        return { key, label: key, fillRate };
      })
      .filter((col) => col.fillRate >= 10)
      .sort((a, b) => b.fillRate - a.fillRate);
  }, [rows]);

  const fetchLeads = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/leads");
      const payload = (await response.json()) as { data?: LeadRow[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Lead listesi alınamadı.");
      }

      setRows(Array.isArray(payload.data) ? payload.data : []);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Lead listesi alınamadı.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleSelectAllColumns = useCallback(() => {
    setVisibleColumns(availableColumns.map((col) => col.key));
  }, [availableColumns]);

  const handleDeselectAllColumns = useCallback(() => {
    setVisibleColumns(["no", "liste", "ad"]);
  }, []);

  return {
    rows,
    setRows,
    visibleColumns,
    setVisibleColumns,
    availableColumns,
    handleSelectAllColumns,
    handleDeselectAllColumns,
    isLoading,
    error,
    refetch: fetchLeads,
  };
}
