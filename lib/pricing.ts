// lib/pricing.ts
//
// Edit prices here.
// All values are stored in cents.

export const PRICES = {
  astroPlusMonthly: 999,    // $9.99
  astroPlusXLMonthly: 1899, // $18.99

  generalReading: 299,      // $2.99
  jxl: 425,                 // $4.25
  replyEach: 100,           // $1.00 each
} as const;

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}