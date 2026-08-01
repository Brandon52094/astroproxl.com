"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import JxlPanel from "@/app/components/JxlPanel";

export default function JxlPage() {
  const router = useRouter();

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
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

      <JxlPanel isActive={true} />
    </div>
  );
}