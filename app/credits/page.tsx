"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export default function CreditsPage() {
  const router = useRouter();

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
        color: "#f1f5f9",
      }}
    >
      {/* Back button — returns to the main reading screen */}
      <button
        type="button"
        onClick={() => router.push("/reading/intake")}
        style={{
          position: "fixed",
          top: "calc(12px + env(safe-area-inset-top))",
          left: "16px",
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          gap: "4px",
          background: "rgba(5,8,22,0.6)",
          border: "1px solid rgba(148,163,184,0.2)",
          borderRadius: "999px",
          padding: "6px 12px 6px 8px",
          color: "#cbd5e1",
          fontSize: "13px",
          cursor: "pointer",
          backdropFilter: "blur(8px)",
        }}
      >
        <ChevronLeft size={16} />
        Back
      </button>

      {/* Page content */}
      <div
        style={{
          maxWidth: 430,
          margin: "0 auto",
          padding: "calc(64px + env(safe-area-inset-top)) 16px calc(32px + env(safe-area-inset-bottom))",
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, textAlign: "center", margin: "0 0 6px" }}>
          Get Credits
        </h1>
        <p style={{ fontSize: 13, textAlign: "center", color: "#94a3b8", margin: "0 0 28px" }}>
          Add what you need, or subscribe below.
        </p>

        {/* ── CART GOES HERE (Readings / Replies / JXL Readings / JXL Replies + Total) ── */}
        <div
          style={{
            borderRadius: 20,
            border: "1px dashed rgba(148,163,184,0.25)",
            padding: 24,
            textAlign: "center",
            color: "#64748b",
            fontSize: 13,
          }}
        >
          Cart coming next — Readings, Replies, JXL Readings, JXL Replies, Total.
        </div>

        {/* ── MEMBERSHIP SECTION GOES HERE (reuse existing) ── */}
        {/* <MembershipPanel ... /> */}
      </div>
    </div>
  );
}