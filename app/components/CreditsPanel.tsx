"use client";

import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, Minus, Plus } from "lucide-react";

/* ─────────────────────────────────────────────
   Products
───────────────────────────────────────────── */

type ProductId = "jxl" | "reading" | "replies";

interface Product {
  id: ProductId;
  title: string;
  desc: string;
  price: number;
}

const PRODUCTS: Product[] = [
  {
    id: "jxl",
    title: "JXL",
    desc: "Includes 3 replies",
    price: 12.99,
  },
  {
    id: "reading",
    title: "General Readings",
    desc: "Includes 2 replies",
    price: 10.0,
  },
  {
    id: "replies",
    title: "More Replies",
    desc: "Works with any reading",
    price: 1.0,
  },
];

interface Balance {
  readings: number;
  jxl: number;
  replies: number;
}

/* ─────────────────────────────────────────────
   Membership
───────────────────────────────────────────── */

const MEMBERSHIP_FEATURES = [
  {
    title: "Unlimited Readings & Replies",
    copy: "Unlimited access to JXL & General Readings with replies.",
  },
  {
    title: "Commission Eligible (request only)",
    copy: "Earn 1–5% recurring commission with subscription referrals.",
  },
  {
    title: "Members-Only Features (beta)",
    copy: "Unlock experiences and tools only XL members can access.",
  },
  {
    title: "Save Your Readings (beta)",
    copy: "Save your reading synopsis so you don't forget.",
  },
  {
    title: "Lowered Cooldowns",
    copy: "More readings, less cooldowns.",
  },
  {
    title: "Member Feedback Box",
    copy: "Send your ideas, requests, and feedback directly to us.",
  },
];

const MEMBERSHIP_PRICING = {
  monthly: { price: 20.0 },
  yearly: { price: 200.0 },
};

const MOCK_BALANCE: Balance = { readings: 2, jxl: 1, replies: 4 };

/* ─────────────────────────────────────────────
   Automated reply pricing
   1–7 replies  = $1 each
   8 replies    = $6
   16 replies   = $12
   etc.
───────────────────────────────────────────── */

function getReplyPrice(quantity: number): number {
  if (quantity <= 0) return 0;
  const groupsOfEight = Math.floor(quantity / 8);
  const remainder = quantity % 8;
  return groupsOfEight * 6 + remainder;
}

function getReplySavings(quantity: number): number {
  return quantity - getReplyPrice(quantity);
}

function plural(n: number, one: string, many?: string): string {
  return n === 1 ? one : many || `${one}s`;
}

/* ─────────────────────────────────────────────
   Starfield Background Component
───────────────────────────────────────────── */

function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Array<{ x: number; y: number; r: number; a: number; tw: number }>>([]);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const root = document.getElementById("root") || document.body;
      canvas.width = window.innerWidth;
      canvas.height = root.offsetHeight || window.innerHeight;
      const count = Math.floor((canvas.width * canvas.height) / 6000);
      starsRef.current = Array.from({ length: Math.min(count, 200) }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.2 + 0.2,
        a: Math.random() * 0.6 + 0.15,
        tw: Math.random() * 0.02 + 0.005,
      }));
    };

    const draw = () => {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      starsRef.current.forEach((s) => {
        s.a += s.tw;
        const alpha = 0.3 + Math.abs(Math.sin(s.a)) * 0.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
      });
      animationRef.current = requestAnimationFrame(draw);
    };

    resize();
    draw();

    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id="stars"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}

/* ─────────────────────────────────────────────
   Main Component
───────────────────────────────────────────── */

export default function CreditsPanel({
  onClose,
  embedded = false,
}: {
  onClose?: () => void;
  embedded?: boolean;
}) {
  const [cart, setCart] = useState<Record<ProductId, number>>({
    jxl: 0,
    reading: 0,
    replies: 0,
  });

  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  // Load balance
  useEffect(() => {
    // Mock API call - replace with actual fetch
    const loadBalance = async () => {
      try {
        // Simulate API delay
        await new Promise((resolve) => setTimeout(resolve, 300));
        setBalance(MOCK_BALANCE);
      } catch {
        // Balance stays null (hidden)
      }
    };
    loadBalance();
  }, []);

  const step = useCallback((id: ProductId, amount: number) => {
    setCart((current) => ({
      ...current,
      [id]: Math.max(0, current[id] + amount),
    }));
  }, []);

  const replySavings = useMemo(
    () => getReplySavings(cart.replies),
    [cart.replies]
  );

  const total = useMemo(() => {
    const jxlTotal = cart.jxl * 12.99;
    const readingTotal = cart.reading * 10;
    const repliesTotal = getReplyPrice(cart.replies);
    return jxlTotal + readingTotal + repliesTotal;
  }, [cart]);

  const handleCheckout = async () => {
    if (total <= 0) return;
    setLoading(true);
    try {
      const items = PRODUCTS.filter((p) => cart[p.id] > 0).map((p) => ({
        id: p.id,
        quantity: cart[p.id],
      }));
      alert(`Checkout pressed:\n${JSON.stringify(items, null, 2)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGetAccess = () => {
    console.log(`XL Access selected: ${billingCycle}`);
    alert(`Subscribe pressed — ${billingCycle}`);
  };

  const inventoryFor = useCallback(
    (id: ProductId): number => {
      if (!balance) return 0;
      if (id === "jxl") return balance.jxl;
      if (id === "reading") return balance.readings;
      return balance.replies;
    },
    [balance]
  );

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
        color: "#f1f5f9",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflowX: "hidden",
        ...(embedded
          ? {
              position: "relative",
              inset: "auto",
              zIndex: "auto",
              width: "100%",
              height: "auto",
              overflowY: "visible",
            }
          : {
              position: "fixed",
              inset: 0,
              zIndex: 50,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
            }),
      }}
      id="root"
    >
      <StarfieldBackground />

      {!embedded && (
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "fixed",
            top: "calc(12px + env(safe-area-inset-top))",
            left: 20,
            zIndex: 100,
            width: 36,
            height: 36,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(5,8,22,0.6)",
            border: "1px solid rgba(148,163,184,0.24)",
            borderRadius: "50%",
            color: "#cbd5e1",
            cursor: "pointer",
            backdropFilter: "blur(8px)",
            boxShadow: "0 14px 30px rgba(0,0,0,0.62), 0 5px 12px rgba(0,0,0,0.48)",
          }}
        >
          <ChevronLeft size={16} />
        </button>
      )}

      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: 430,
          margin: "0 auto",
          padding: `calc(${embedded ? 20 : 44}px + env(safe-area-inset-top)) 20px calc(${embedded ? 20 : 60}px + env(safe-area-inset-bottom))`,
          minHeight: "100vh",
          boxSizing: "border-box",
        }}
      >
        {/* ─────────────────────────────
            MEMBERSHIP FRAME
        ───────────────────────────── */}

        <section
          style={{
            position: "relative",
            padding: "56px 34px 70px",
            minHeight: 430,
          }}
        >
          {/* Left Bracket */}
          <div
            style={{
              position: "absolute",
              top: 22,
              bottom: 20,
              left: 0,
              width: 54,
              borderLeft: "1.5px solid rgba(251,191,36,0.72)",
              pointerEvents: "none",
              filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.85)) drop-shadow(0 3px 5px rgba(0,0,0,0.65))",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 54,
                height: 1.5,
                background: "rgba(251,191,36,0.72)",
              }}
            />
            <span
              style={{
                position: "absolute",
                left: 0,
                bottom: 0,
                width: 54,
                height: 1.5,
                background: "rgba(251,191,36,0.72)",
              }}
            />
          </div>

          {/* Right Bracket */}
          <div
            style={{
              position: "absolute",
              top: 22,
              bottom: 20,
              right: 0,
              width: 54,
              borderRight: "1.5px solid rgba(251,191,36,0.72)",
              pointerEvents: "none",
              filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.85)) drop-shadow(0 3px 5px rgba(0,0,0,0.65))",
            }}
          >
            <span
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                width: 54,
                height: 1.5,
                background: "rgba(251,191,36,0.72)",
              }}
            />
            <span
              style={{
                position: "absolute",
                right: 0,
                bottom: 0,
                width: 54,
                height: 1.5,
                background: "rgba(251,191,36,0.72)",
              }}
            />
          </div>

          {/* Bracket Pricing */}
          <button
            type="button"
            onClick={() => setBillingCycle("monthly")}
            style={{
              position: "absolute",
              left: 0,
              bottom: -2,
              border: "none",
              background: "transparent",
              padding: 0,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              cursor: "pointer",
              color: billingCycle === "monthly" ? "#fde68a" : "#64748b",
              opacity: billingCycle === "monthly" ? 1 : 0.42,
              filter: billingCycle === "monthly" ? "blur(0px)" : "blur(0.7px)",
              textShadow: billingCycle === "monthly"
                ? "0 4px 10px rgba(0,0,0,0.9), 0 0 10px rgba(251,191,36,0.25)"
                : "none",
            }}
          >
            $20.00
          </button>

          <button
            type="button"
            onClick={() => setBillingCycle("yearly")}
            style={{
              position: "absolute",
              right: 0,
              bottom: -2,
              border: "none",
              background: "transparent",
              padding: 0,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              cursor: "pointer",
              color: billingCycle === "yearly" ? "#fde68a" : "#64748b",
              opacity: billingCycle === "yearly" ? 1 : 0.42,
              filter: billingCycle === "yearly" ? "blur(0px)" : "blur(0.7px)",
              textShadow: billingCycle === "yearly"
                ? "0 4px 10px rgba(0,0,0,0.9), 0 0 10px rgba(251,191,36,0.25)"
                : "none",
            }}
          >
            $200.00
          </button>

          <div
            style={{
              position: "absolute",
              top: 11,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 3,
              padding: "0 18px",
              background: "#050816",
              color: "#fef3c7",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.18em",
              whiteSpace: "nowrap",
              textShadow: "0 4px 10px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.6)",
            }}
          >
            MEMBERSHIP
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            {MEMBERSHIP_FEATURES.map((feature) => (
              <div
                key={feature.title}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(105px, 0.72fr) minmax(0, 1.5fr)",
                  columnGap: 22,
                  alignItems: "start",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    lineHeight: 1.3,
                    fontWeight: 700,
                    color: "#f8fafc",
                    textShadow: "0 4px 10px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.6)",
                  }}
                >
                  {feature.title}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: "#a7b1c3",
                  }}
                >
                  {feature.copy}
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleGetAccess}
            style={{
              position: "absolute",
              left: "50%",
              bottom: -2,
              transform: "translateX(-50%)",
              zIndex: 3,
              overflow: "hidden",
              minWidth: 154,
              height: 46,
              padding: "0 24px",
              borderRadius: 10,
              border: "1px solid rgba(251,191,36,0.72)",
              background: "#050816",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: "pointer",
              boxShadow: "0 14px 30px rgba(0,0,0,0.62), 0 0 18px rgba(251,191,36,0.10)",
              whiteSpace: "nowrap",
            }}
          >
            SUBSCRIBE
            <span
              style={{
                content: '""',
                position: "absolute",
                top: 0,
                left: "-60%",
                width: "45%",
                height: "100%",
                background: "linear-gradient(120deg, transparent, rgba(255,255,255,0.55), transparent)",
                transform: "skewX(-20deg)",
                animation: "shimmer-sweep 3.4s ease-in-out infinite",
              }}
            />
          </button>
        </section>

        {/* ─────────────────────────────
            BILLING TOGGLE
        ───────────────────────────── */}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            margin: "26px 0 20px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                fontSize: 11,
                fontWeight: 600,
                color: billingCycle === "monthly" ? "#fde68a" : "#64748b",
                letterSpacing: "0.05em",
                cursor: "pointer",
                textShadow: billingCycle === "monthly"
                  ? "0 4px 10px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.6)"
                  : "none",
              }}
            >
              Monthly
            </button>

            <button
              type="button"
              aria-pressed={billingCycle === "yearly"}
              onClick={() =>
                setBillingCycle((current) =>
                  current === "monthly" ? "yearly" : "monthly"
                )
              }
              style={{
                width: 44,
                height: 24,
                borderRadius: 9999,
                padding: 0,
                cursor: "pointer",
                border: billingCycle === "yearly"
                  ? "1px solid rgba(251,191,36,0.45)"
                  : "1px solid rgba(148,163,184,0.24)",
                background: billingCycle === "yearly"
                  ? "rgba(251,191,36,0.12)"
                  : "rgba(255,255,255,0.06)",
                position: "relative",
                boxShadow: "0 14px 30px rgba(0,0,0,0.62), 0 5px 12px rgba(0,0,0,0.48)",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: billingCycle === "yearly" ? 22 : 2,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#fde68a",
                  transition: "left 0.2s ease",
                }}
              />
            </button>

            <button
              type="button"
              onClick={() => setBillingCycle("yearly")}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                fontSize: 11,
                fontWeight: 600,
                color: billingCycle === "yearly" ? "#fde68a" : "#64748b",
                letterSpacing: "0.05em",
                cursor: "pointer",
                textShadow: billingCycle === "yearly"
                  ? "0 4px 10px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.6)"
                  : "none",
              }}
            >
              Yearly
            </button>
          </div>
        </div>

        {/* ─────────────────────────────
            GET CREDITS
        ───────────────────────────── */}

        <div
          style={{
            margin: "8px 0 26px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                flex: 1,
                height: 1,
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
              }}
            />
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: "0.16em",
                color: "#fff",
                textAlign: "center",
                whiteSpace: "nowrap",
                textShadow: "0 4px 14px rgba(255,255,255,0.4), 0 0 22px rgba(255,255,255,0.18)",
              }}
            >
              GET CREDITS
            </div>
            <div
              style={{
                flex: 1,
                height: 1,
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
              }}
            />
          </div>

          {balance && (
            <p
              style={{
                textAlign: "center",
                fontSize: 10.5,
                lineHeight: 1.45,
                color: "#7f8ba3",
                margin: "4px 2px 0",
              }}
            >
              You currently have{" "}
              <b style={{ color: "#cbd5e1", fontWeight: 600 }}>
                {balance.readings}
              </b>{" "}
              {plural(balance.readings, "reading")},{" "}
              <b style={{ color: "#cbd5e1", fontWeight: 600 }}>
                {balance.jxl}
              </b>{" "}
              JXL, and{" "}
              <b style={{ color: "#cbd5e1", fontWeight: 600 }}>
                {balance.replies}
              </b>{" "}
              {plural(balance.replies, "reply", "replies")}.
            </p>
          )}
        </div>

        {/* ─────────────────────────────
            PRODUCTS
        ───────────────────────────── */}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {PRODUCTS.map((product) => {
            const quantity = cart[product.id];
            const isReplies = product.id === "replies";
            const displayedPrice = isReplies
              ? getReplyPrice(quantity || 1)
              : product.price;
            const savings = isReplies ? getReplySavings(quantity) : 0;

            return (
              <div
                key={product.id}
                style={{
                  position: "relative",
                  minHeight: 84,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "14px 20px",
                  border: "1px solid rgba(148,163,184,0.24)",
                  borderRadius: 22,
                  background: "linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018))",
                  boxShadow: "0 14px 30px rgba(0,0,0,0.62), 0 5px 12px rgba(0,0,0,0.48)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -10,
                    right: -8,
                    width: 27,
                    height: 27,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid rgba(251,191,36,0.65)",
                    background: "#07101d",
                    color: "#fde68a",
                    fontSize: 11,
                    fontWeight: 700,
                    zIndex: 4,
                    boxShadow: "0 14px 30px rgba(0,0,0,0.62), 0 5px 12px rgba(0,0,0,0.48)",
                  }}
                >
                  {inventoryFor(product.id) + quantity}
                </div>

                <button
                  type="button"
                  onClick={() => step(product.id, -1)}
                  disabled={quantity <= 0}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#f8fafc",
                    cursor: quantity <= 0 ? "default" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 6,
                    flexShrink: 0,
                    opacity: quantity <= 0 ? 0.22 : 1,
                  }}
                >
                  <Minus size={18} />
                </button>

                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 800,
                      letterSpacing: "0.03em",
                      color: "#fff",
                      textTransform: "uppercase",
                      textShadow: "0 4px 10px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.6)",
                    }}
                  >
                    {product.title}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#94a3b8",
                    }}
                  >
                    {isReplies && quantity > 0
                      ? `${product.desc} · $${displayedPrice.toFixed(2)} selected`
                      : `${product.desc} · $${product.price.toFixed(2)}`}
                  </div>
                  {isReplies && savings > 0 && (
                    <div
                      style={{
                        fontSize: 9.5,
                        color: "#fbbf24",
                        textShadow: "0 4px 10px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.6)",
                      }}
                    >
                      You save ${savings.toFixed(2)}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => step(product.id, 1)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#f8fafc",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 6,
                    flexShrink: 0,
                  }}
                >
                  <Plus size={20} />
                </button>
              </div>
            );
          })}
        </div>

        {/* ─────────────────────────────
            CHECKOUT
        ───────────────────────────── */}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 8,
            gap: 8,
          }}
        >
          {replySavings > 0 && (
            <div
              style={{
                fontSize: 10.5,
                color: "#fbbf24",
                textShadow: "0 4px 10px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.6)",
              }}
            >
              Reply savings: ${replySavings.toFixed(2)}
            </div>
          )}

          <button
            type="button"
            onClick={handleCheckout}
            disabled={total <= 0 || loading}
            style={{
              height: 46,
              padding: "0 24px",
              minWidth: 154,
              borderRadius: 10,
              border: "1px solid rgba(45,212,191,0.85)",
              background: "#050816",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: total <= 0 || loading ? "default" : "pointer",
              whiteSpace: "nowrap",
              opacity: total <= 0 || loading ? 0.36 : 1,
              boxShadow: total > 0 && !loading
                ? "0 0 0 1px rgba(255,255,255,0.25), 0 0 16px rgba(255,255,255,0.35), 0 0 22px rgba(45,212,191,0.22)"
                : "none",
              animation: total > 0 && !loading
                ? "checkout-pulse 2.6s ease-in-out 0.6s infinite"
                : "none",
            }}
          >
            {loading ? "…" : "CHECKOUT"}
          </button>
        </div>

        <p
          style={{
            textAlign: "center",
            fontSize: 10.5,
            lineHeight: 1.45,
            color: "#7f8ba3",
            margin: "32px 2px 0",
          }}
        >
          {balance && (
            <>
              You currently have{" "}
              <b style={{ color: "#cbd5e1", fontWeight: 600 }}>
                {balance.readings}
              </b>{" "}
              {plural(balance.readings, "reading")},{" "}
              <b style={{ color: "#cbd5e1", fontWeight: 600 }}>
                {balance.jxl}
              </b>{" "}
              JXL, and{" "}
              <b style={{ color: "#cbd5e1", fontWeight: 600 }}>
                {balance.replies}
              </b>{" "}
              {plural(balance.replies, "reply", "replies")}.
            </>
          )}
        </p>

        {/* Shimmer animation keyframes */}
        <style>{`
          @keyframes shimmer-sweep {
            0% { left: -60%; }
            45% { left: 130%; }
            100% { left: 130%; }
          }
          @keyframes checkout-pulse {
            0%, 100% { box-shadow: 0 0 0 1px rgba(255,255,255,0.25), 0 0 16px rgba(255,255,255,0.35), 0 0 22px rgba(45,212,191,0.22); }
            50% { box-shadow: 0 0 0 1px rgba(255,255,255,0.35), 0 0 20px rgba(255,255,255,0.45), 0 0 30px rgba(45,212,191,0.4); }
          }
        `}</style>
      </div>
    </div>
  );
}