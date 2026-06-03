"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, Sparkles, Lock, Timer } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadChart } from "@/lib/chartStore";
import { JXL_CARING_MESSAGE } from "@/lib/jxlConfig";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

interface JxlSession {
  isUnlocked: boolean;
  jxlCredits: number;
  jxlSessionsPurchased: number;
  canUseFreebie: boolean;
  freebieResetsAt: string | null;
  freebieReplies: number;
  onCycleCooldown: boolean;
  cycleResetsAt: string | null;
  nextTier: string | null;
  nextPack: {
    tier: string;
    name: string;
    tagline: string;
    displayPrice: string;
    replies: number;
  } | null;
  showCaringMessage: boolean;
  caringMessage: string | null;
  subscriberCanBuyMore: boolean;
  isSubscribed: boolean;
  maxSessionsPerCycle: number;
}

const STORAGE_KEY = "jxl_conversation";

function formatTimeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "soon";
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

export default function JxlScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState<JxlSession | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  const chart = loadChart();

  // ── Fetch session state ───────────────────────────────────────────────────
  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/jxl/session");
      const data: JxlSession = await res.json();
      setSession(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  // ── Load conversation from localStorage ──────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Message[];
        // Strip any isStreaming flags from stored messages
        setMessages(parsed.map(({ role, content }) => ({ role, content })));
      }
    } catch { /* silent */ }
    setSessionLoaded(true);
  }, []);

  // ── Save conversation to localStorage ────────────────────────────────────
  useEffect(() => {
    if (!sessionLoaded) return;
    try {
      const clean = messages
        .filter((m) => !m.isStreaming)
        .map(({ role, content }) => ({ role, content }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch { /* silent */ }
  }, [messages, sessionLoaded]);

  // ── On mount: fetch session + handle payment return ───────────────────────
  useEffect(() => {
    const payment = searchParams.get("payment");
    const mode = searchParams.get("mode");

    if (payment === "success" && mode === "jxl") {
      // Clear URL params without reload
      window.history.replaceState({}, "", "/jxl");
      // Refetch session to get updated credits
      fetchSession();
    } else {
      fetchSession();
    }
  }, [searchParams, fetchSession]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const isFreebie = session
    ? session.canUseFreebie && session.jxlCredits <= 0 && !session.isSubscribed
    : false;

  const creditsRemaining = session?.jxlCredits ?? 0;
  const userRepliesCount = messages.filter((m) => m.role === "user").length;

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading || !chart || !session) return;

    // Check if out of credits before sending
    if (!isFreebie && creditsRemaining <= 0) {
      setShowPaywall(true);
      return;
    }

    const userMessage: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    // Add streaming placeholder
    setMessages((prev) => [...prev, { role: "assistant", content: "", isStreaming: true }]);

    try {
      const cleanMessages = newMessages.map(({ role, content }) => ({ role, content }));

      const res = await fetch("/api/jxl/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: cleanMessages,
          chart,
        }),
      });

      if (res.status === 402) {
        setMessages((prev) => prev.filter((m) => !m.isStreaming));
        setShowPaywall(true);
        return;
      }

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        fullText += chunk;
        setMessages((prev) =>
          prev.map((m) => m.isStreaming ? { ...m, content: fullText } : m)
        );
      }

      // Finalize streaming message
      setMessages((prev) =>
        prev.map((m) => m.isStreaming ? { ...m, content: fullText, isStreaming: false } : m)
      );

      // Refresh session to get updated credit count
      const updated = await fetchSession();

      // Show paywall if credits ran out after this message
      if (updated && updated.jxlCredits <= 0 && !updated.isSubscribed && !updated.canUseFreebie) {
        setTimeout(() => setShowPaywall(true), 800);
      }

      // Show caring message if at session boundary
      if (updated?.showCaringMessage) {
        setTimeout(() => setShowPaywall(true), 800);
      }

    } catch {
      setMessages((prev) => prev.filter((m) => !m.isStreaming));
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, chart, session, isFreebie, creditsRemaining, fetchSession]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Checkout ──────────────────────────────────────────────────────────────
  const handleCheckout = async (tier: string) => {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/jxl`,
          mode: "jxl",
          jxlTier: tier,
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch { /* silent */ }
    finally { setCheckoutLoading(false); }
  };

  // ── Clear conversation ────────────────────────────────────────────────────
  const clearConversation = () => {
    setMessages([]);
    setShowPaywall(false);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* silent */ }
  };

  if (!sessionLoaded) {
    return (
      <div className="min-h-screen bg-[#050816] flex items-center justify-center">
        <div className="h-2 w-2 animate-pulse rounded-full bg-amber-300" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#050816] text-slate-100">

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#050816]/90 backdrop-blur-xl sticky top-0 z-10">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition hover:border-amber-300/30 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-300" />
          <span className="text-[14px] font-semibold text-white">Ask Jxl</span>
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearConversation}
              className="text-[10px] text-slate-600 transition hover:text-slate-400"
            >
              Clear
            </button>
          )}
          <div className="flex h-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-3 text-[11px] font-medium text-slate-400">
            {isFreebie ? `${Math.max(0, (session?.freebieReplies ?? 6) - userRepliesCount)} free` : `${creditsRemaining} left`}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 pb-32">

        {/* Opening prompt */}
        {messages.length === 0 && !showPaywall && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center text-center pt-8 pb-4"
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-amber-300/30 bg-amber-400/10">
              <Sparkles className="h-6 w-6 text-amber-300" />
            </div>
            <h2 className="mb-2 text-[18px] font-semibold text-white">
              What's going on?
            </h2>
            <p className="max-w-[28ch] text-[13px] leading-5 text-slate-400">
              Tell Jxl what's happening in your life right now. No categories, no prompts — just what's on your mind.
            </p>
            {isFreebie && (
              <span className="mt-4 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-[11px] text-amber-300/80">
                {session?.freebieReplies ?? 6} free replies · resets every 4 weeks
              </span>
            )}
          </motion.div>
        )}

        {/* Message bubbles */}
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-[20px] px-4 py-3 text-[14px] leading-6",
                  msg.role === "user"
                    ? "bg-teal-400/20 text-white rounded-br-[6px]"
                    : "bg-white/[0.05] border border-white/10 text-slate-200 rounded-bl-[6px]"
                )}
              >
                {msg.content}
                {msg.isStreaming && (
                  <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-amber-300 rounded-full" />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Paywall / caring message */}
        <AnimatePresence>
          {showPaywall && session && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[24px] border border-amber-300/20 bg-amber-400/[0.06] p-5"
            >
              {/* Caring message — session boundary */}
              {session.showCaringMessage ? (
                <>
                  <div className="mb-3 flex justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-300/30 bg-amber-400/10">
                      <Timer className="h-5 w-5 text-amber-300" />
                    </div>
                  </div>
                  <p className="mb-2 text-center text-[14px] font-semibold text-white">
                    You've gone deep this cycle.
                  </p>
                  <p className="mb-4 text-center text-[12px] leading-5 text-slate-400">
                    {session.caringMessage ?? JXL_CARING_MESSAGE}
                  </p>
                  {session.cycleResetsAt && (
                    <p className="text-center text-[11px] text-amber-300/60">
                      Next window opens in {formatTimeRemaining(session.cycleResetsAt)}
                    </p>
                  )}
                </>
              ) : session.onCycleCooldown ? (
                // Cooldown state
                <>
                  <div className="mb-3 flex items-center gap-2">
                    <Lock className="h-4 w-4 text-amber-300" />
                    <span className="text-[13px] font-semibold text-white">
                      Cycle complete
                    </span>
                  </div>
                  <p className="mb-2 text-[12px] leading-5 text-slate-400">
                    {JXL_CARING_MESSAGE}
                  </p>
                  {session.cycleResetsAt && (
                    <p className="text-[11px] text-amber-300/60">
                      Resets in {formatTimeRemaining(session.cycleResetsAt)}
                    </p>
                  )}
                </>
              ) : (
                // Session paywall — next session to purchase
                <>
                  <div className="mb-3 flex items-center gap-2">
                    <Lock className="h-4 w-4 text-amber-300" />
                    <span className="text-[13px] font-semibold text-white">
                      {isFreebie
                        ? "Your free session is complete"
                        : "This session is complete"}
                    </span>
                  </div>
                  <p className="mb-4 text-[12px] leading-5 text-slate-400">
                    {isFreebie
                      ? "You've felt what Jxl can do. The conversation picks up exactly where it left off."
                      : "The next session continues from here — nothing resets."}
                  </p>

                  {session.nextPack && (
                    <button
                      type="button"
                      onClick={() => handleCheckout(session.nextPack!.tier)}
                      disabled={checkoutLoading}
                      className="w-full rounded-[18px] bg-amber-300 px-5 py-3 text-left transition hover:bg-amber-200 disabled:opacity-60"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[13px] font-semibold text-slate-950">
                            {session.nextPack.name}
                          </p>
                          <p className="text-[11px] text-slate-800">
                            {session.nextPack.tagline}
                          </p>
                        </div>
                        <span className="text-[16px] font-bold text-slate-950">
                          {session.nextPack.displayPrice}
                        </span>
                      </div>
                    </button>
                  )}

                  {/* Show all sessions for context */}
                  <div className="mt-3 space-y-2">
                    {["session_1", "session_2", "session_3", "session_4", "session_5"].map((tier, i) => {
                      const prices = ["$4.99", "$8.99", "$12.99", "$16.99", "$19.99"];
                      const names = ["Session 1", "Session 2", "Session 3", "Session 4", "Session 5"];
                      const isNext = tier === session.nextPack?.tier;
                      if (isNext) return null; // Already shown above
                      return (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => handleCheckout(tier)}
                          disabled={checkoutLoading}
                          className="w-full rounded-[16px] border border-white/10 bg-white/[0.03] px-4 py-2.5 text-left transition hover:border-amber-300/20 disabled:opacity-40"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] text-slate-400">{names[i]}</span>
                            <span className="text-[12px] font-semibold text-slate-300">{prices[i]}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Input — hidden when paywall shown or on cooldown */}
      {!showPaywall && !session?.onCycleCooldown && (
        <div className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-[#050816]/90 px-4 py-3 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-md items-end gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell Jxl what's going on…"
              rows={1}
              className="flex-1 resize-none rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3 text-[14px] leading-6 text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-300/30 max-h-32 overflow-y-auto"
              style={{ minHeight: "48px" }}
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-300 text-slate-950 transition hover:bg-amber-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
