import { z } from "zod";

export const PlanetPlacementSchema = z.object({
  name: z.string(),
  sign: z.string(),
  degree: z.string(),
  house: z.string().optional(),
  notes: z.string().optional(),
});

export const AngleSchema = z.object({
  sign: z.string(),
  degree: z.string(),
});

export const AspectSchema = z.object({
  type: z.enum(["conjunction", "opposition", "square", "trine", "sextile"]),
  planetA: z.string(),
  planetB: z.string(),
  orbDegrees: z.number(),
  notes: z.string().optional(),
});

export const NormalizedChartSchema = z.object({
  birthDate: z.string(),
  birthTime: z.string(),
  birthPlace: z.string(),
  timezone: z.string().optional(),
  coordinates: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
  planets: z.array(PlanetPlacementSchema),
  angles: z.object({
    asc: AngleSchema.optional(),
    mc: AngleSchema.optional(),
    ic: AngleSchema.optional(),
    dc: AngleSchema.optional(),
  }),
  aspects: z.array(AspectSchema).default([]),
});

export type NormalizedChart = z.infer<typeof NormalizedChartSchema>;
export type PlanetPlacement = z.infer<typeof PlanetPlacementSchema>;
export type Aspect = z.infer<typeof AspectSchema>;