/**
 * useChartExtract
 *
 * A client-side hook that calls /api/chart-extract with a screenshot image,
 * and returns the normalized extraction result ready to hydrate ChartDataScreen state.
 *
 * Usage:
 *   const { extract, loading, error, result } = useChartExtract();
 *   await extract(file);  // file from <input type="file"> or drag-drop
 */

"use client";

import { useState, useCallback } from "react";

// ─── Types (mirror route.ts — import from there if you colocate types) ────────

export interface PlacementValue {
  value: string;
  confidence: "high" | "medium" | "low";
  raw: string;
}

export interface ChartExtractResponse {
  success: boolean;
  birthDate: PlacementValue | null;
  birthTime: PlacementValue | null;
  birthPlace: PlacementValue | null;
  corePlacements: {
    sun: PlacementValue | null;
    moon: PlacementValue | null;
    rising: PlacementValue | null;
    mercury: PlacementValue | null;
    venus: PlacementValue | null;
    mars: PlacementValue | null;
  };
  advancedPlacements: {
    jupiter: PlacementValue | null;
    saturn: PlacementValue | null;
    uranus: PlacementValue | null;
    neptune: PlacementValue | null;
    pluto: PlacementValue | null;
    northNode: PlacementValue | null;
  };
  aspects: string;
  chartSource: string;
  missingRequiredFields: string[];
  lowConfidenceFields: string[];
  extractionNotes: string;
  error?: string;
}

/**
 * A flattened, form-ready version of the extraction result.
 * All values are plain strings — ready to drop into useState setters.
 * Fields that were not found or are low confidence are empty strings.
 */
export interface ExtractedFormValues {
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  corePlacements: {
    sun: string;
    moon: string;
    rising: string;
    mercury: string;
    venus: string;
    mars: string;
  };
  advancedPlacements: {
    jupiter: string;
    saturn: string;
    uranus: string;
    neptune: string;
    pluto: string;
    northNode: string;
  };
  aspects: string;
  chartSource: string;
  /** Fields that were found but flagged as uncertain — show these highlighted in the UI */
  lowConfidenceFields: string[];
  /** Required fields not found in the image — user must fill these manually */
  missingRequiredFields: string[];
  /** Human-readable notes about the extraction for display in the UI */
  extractionNotes: string;
}

// ─── Value helper ─────────────────────────────────────────────────────────────

/**
 * Unwrap a PlacementValue to a plain string.
 * Returns empty string for null or low-confidence fields
 * (low-confidence fields are still returned but flagged separately).
 */
function val(placement: PlacementValue | null): string {
  if (!placement) return "";
  return placement.value?.trim() ?? "";
}

/**
 * Map the raw API response into form-ready values.
 */
function mapToFormValues(data: ChartExtractResponse): ExtractedFormValues {
  return {
    birthDate: val(data.birthDate),
    birthTime: val(data.birthTime),
    birthPlace: val(data.birthPlace),
    corePlacements: {
      sun: val(data.corePlacements.sun),
      moon: val(data.corePlacements.moon),
      rising: val(data.corePlacements.rising),
      mercury: val(data.corePlacements.mercury),
      venus: val(data.corePlacements.venus),
      mars: val(data.corePlacements.mars),
    },
    advancedPlacements: {
      jupiter: val(data.advancedPlacements.jupiter),
      saturn: val(data.advancedPlacements.saturn),
      uranus: val(data.advancedPlacements.uranus),
      neptune: val(data.advancedPlacements.neptune),
      pluto: val(data.advancedPlacements.pluto),
      northNode: val(data.advancedPlacements.northNode),
    },
    aspects: data.aspects ?? "",
    chartSource: data.chartSource ?? "",
    lowConfidenceFields: data.lowConfidenceFields ?? [],
    missingRequiredFields: data.missingRequiredFields ?? [],
    extractionNotes: data.extractionNotes ?? "",
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseChartExtractReturn {
  extract: (file: File) => Promise<ExtractedFormValues | null>;
  loading: boolean;
  error: string | null;
  result: ExtractedFormValues | null;
  rawResponse: ChartExtractResponse | null;
  reset: () => void;
}

export function useChartExtract(): UseChartExtractReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractedFormValues | null>(null);
  const [rawResponse, setRawResponse] = useState<ChartExtractResponse | null>(null);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setResult(null);
    setRawResponse(null);
  }, []);

  const extract = useCallback(async (file: File): Promise<ExtractedFormValues | null> => {
    setLoading(true);
    setError(null);
    setResult(null);
    setRawResponse(null);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/chart-extract", {
        method: "POST",
        body: formData,
      });

      const data: ChartExtractResponse = await response.json();
      setRawResponse(data);

      if (!response.ok || !data.success) {
        const msg = data.error ?? "Extraction failed. Please try again.";
        setError(msg);
        return null;
      }

      const mapped = mapToFormValues(data);
      setResult(mapped);
      return mapped;

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error. Please try again.";
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { extract, loading, error, result, rawResponse, reset };
}
