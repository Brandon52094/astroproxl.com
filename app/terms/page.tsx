"use client";

import React from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function TermsPage() {
  const router = useRouter();

  return (
    <div className="h-screen overflow-y-auto overscroll-none bg-[#050816] text-slate-100"
      style={{ WebkitOverflowScrolling: "touch" }}>
      <div className="mx-auto w-full max-w-md px-4 pb-16 pt-4">
        <header className="mb-6 flex items-center gap-3 py-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition hover:border-teal-300/30 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">AstroProXL</p>
            <p className="mt-0.5 text-sm font-medium text-white">Terms & Conditions</p>
          </div>
        </header>

        <div className="space-y-6 text-sm leading-7 text-slate-300">
          <p className="text-xs text-slate-500">Last updated: [DATE]</p>

          {/* ── REPLACE EVERYTHING BELOW WITH YOUR ACTUAL TERMS ───────────── */}

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">1. Acceptance of Terms</h2>
            <p>[Your terms text here]</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">2. Description of Service</h2>
            <p>[Your terms text here]</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">3. Entertainment Purposes Disclaimer</h2>
            <p>[Your terms text here]</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">4. Payments & Refunds</h2>
            <p>[Your terms text here]</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">5. User Data & Privacy</h2>
            <p>[Your terms text here]</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">6. Limitation of Liability</h2>
            <p>[Your terms text here]</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">7. Contact</h2>
            <p>[Your contact info here]</p>
          </section>

          {/* ── END REPLACE ───────────────────────────────────────────────── */}
        </div>
      </div>
    </div>
  );
}
