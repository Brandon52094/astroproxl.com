import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050816] px-4">
      {/* Cosmic background atmosphere — subtle glow + stars, matches the rest of the app */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-1/4 h-[420px] w-[420px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(94,234,212,0.25), transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 right-0 h-[320px] w-[320px] rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(251,191,36,0.2), transparent 70%)" }}
        />
        {/* Sparse star dots */}
        {[...Array(24)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: Math.random() > 0.8 ? "2px" : "1px",
              height: Math.random() > 0.8 ? "2px" : "1px",
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.5 + 0.2,
            }}
          />
        ))}
      </div>

      {/* Brand mark above the card */}
      <div className="relative z-10 flex flex-col items-center">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-teal-300/30 bg-teal-400/10 shadow-[0_0_20px_rgba(94,234,212,0.25)]">
            <span className="text-xl">✦</span>
          </div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">
            AstroProXL
          </p>
        </div>

        <SignIn
          appearance={{
            variables: {
              colorPrimary: "#5eead4",
              colorBackground: "#0a0f24",
              colorText: "#e2e8f0",
              colorTextSecondary: "#94a3b8",
              colorInputBackground: "#050816",
              colorInputText: "#ffffff",
              borderRadius: "20px",
            },
            elements: {
              card: "shadow-[0_0_40px_rgba(94,234,212,0.08)] border border-white/10",
              headerTitle: "text-white",
              headerSubtitle: "text-slate-400",
              socialButtonsBlockButton: "border-white/10",
              formFieldInput: "border-white/10 focus:border-teal-300/50",
              formButtonPrimary: "bg-teal-300 hover:bg-teal-200 text-slate-950",
              footerActionLink: "text-teal-300 hover:text-teal-200",
              identityPreviewEditButton: "text-teal-300",
            },
          }}
        />
      </div>
    </div>
  );
}