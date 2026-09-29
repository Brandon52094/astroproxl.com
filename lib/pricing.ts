// lib/pricing.ts
//
// Edit prices here.
// All values are stored in cents.

export const PRICES = {
  astroPlusMonthly: 2099, // $20.99
  generalReading: 499,    // $4.99
  jxl: 699,               // $6.99
  replyEach: 100,         // $1.00 each
} as const;

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}