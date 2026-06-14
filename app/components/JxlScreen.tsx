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

function renderMessage(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

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
  const scrollRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState<JxlSession | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  const chart = loadChart();

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

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Message[];
        setMessages(parsed.map(({ role, content }) => ({ role, content })));
      }
    } catch { /* silent */ }
    setSessionLoaded(true);
  }, []);

  useEffect(() => {
    if (!sessionLoaded) return;
    try {
      const clean = messages
        .filter((m) => !m.isStreaming)
        .map(({ role, content }) => ({ role, content }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch { /* silent */ }
  }, [messages, sessionLoaded]);

  useEffect(() => {
    const payment = searchParams.get("payment");
    const mode = searchParams.get("mode");
    if (payment === "success" && mode === "jxl") {
      window.history.replaceState({}, "", "/jxl");
      fetchSession();
    } else {
      fetchSession();
    }
  }, [searchParams, fetchSession]);

  // Auto-scroll the inner container, not window
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isFreebie = session
    ? session.canUseFreebie && session.jxlCredits <= 0 && !session.isSubscribed
    : false;

  const creditsRemaining = session?.jxlCredits ?? 0;
  const userRepliesCount = messages.filter((m) => m.role === "user").length;

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading || !chart || !session) return;

    if (!isFreebie && !session.isSubscribed && creditsRemaining <= 0) {
      setShowPaywall(true);
      return;
    }

    const userMessage: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    setMessages((prev) => [...prev, { role: "assistant", content: "", isStreaming: true }]);

    try {
      const cleanMessages = newMessages.map(({ role, content }) => ({ role, content }));

      const res = await fetch("/api/jxl/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: cleanMessages, chart }),
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

      // Check for split marker — renders two bubbles with a natural delay between them
      const SPLIT_MARKER = "||SPLIT||";
      if (fullText.includes(SPLIT_MARKER)) {
        const [partOne, partTwo] = fullText.split(SPLIT_MARKER).map((s: string) => s.trim());
        // Finalize first bubble
        setMessages((prev) =>
          prev.map((m) => m.isStreaming ? { ...m, content: partOne, isStreaming: false } : m)
        );
        // Drop second bubble after a natural pause — like a second text arriving
        setTimeout(() => {
          setMessages((prev) => [...prev, { role: "assistant", content: partTwo, isStreaming: false }]);
        }, 1200);
      } else {
        setMessages((prev) =>
          prev.map((m) => m.isStreaming ? { ...m, content: fullText, isStreaming: false } : m)
        );
      }

      const updated = await fetchSession();

      if (updated && updated.jxlCredits <= 0 && !updated.isSubscribed && !updated.canUseFreebie) {
        setTimeout(() => setShowPaywall(true), 800);
      }
      // Never show paywall for subscribers

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

  const handleCheckout = async (tier: string) => {
    setCheckoutLoading(true);
    try {
      // Subscription option routes to subscription checkout
      if (tier === "subscription") {
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            returnUrl: `${window.location.origin}/jxl`,
            mode: "subscription",
            paywallIndex: 1,
          }),
        });
        const data = await res.json();
        if (data.url) window.location.href = data.url;
        return;
      }
      // JXL session purchase
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

  const clearConversation = () => {
    setMessages([]);
    setShowPaywall(false);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* silent */ }
  };

  if (!sessionLoaded) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#050816]">
        <div className="h-2 w-2 animate-pulse rounded-full bg-amber-300" />
      </div>
    );
  }

  return (
    /*
      Outer shell: h-screen overflow-hidden — the viewport is locked.
      The messages area scrolls internally via flex-1 overflow-y-auto.
      The header and input bar are fixed within this container, not the window.
    */
    <div className="fixed inset-0 flex justify-center bg-[#050816] overflow-hidden">
      <div className="flex w-full max-w-[430px] flex-col" style={{ height: "100dvh" }}>

        {/* Header — stuck to top of phone frame */}
        <header className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-white/10 bg-[#050816]/90 backdrop-blur-xl z-10">
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
              {session?.isSubscribed
                ? "Unlimited"
                : isFreebie
                  ? `${Math.max(0, (session?.freebieReplies ?? 6) - userRepliesCount)} free`
                  : `${creditsRemaining} left`}
            </div>
          </div>
        </header>

        {/* Messages — scrollable area between header and input */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-none px-4 py-6 space-y-4"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
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
                Tell me about a specific scenario you need clarity on.
              </h2>
              <p className="max-w-[28ch] text-[13px] leading-5 text-slate-400">
                The more information you share, the more precise the read.
              </p>
              {isFreebie && (
                <span className="mt-4 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-[11px] text-amber-300/80">
                  {session?.freebieReplies ?? 6} free replies · resets every 4 weeks
                </span>
              )}
            </motion.div>
          )}

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
                  {msg.isStreaming ? msg.content : renderMessage(msg.content)}
                  {msg.isStreaming && (
                    <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-amber-300 rounded-full" />
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          <AnimatePresence>
            {showPaywall && session && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[24px] border border-amber-300/20 bg-amber-400/[0.06] p-5"
              >
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
                  <>
                    <div className="mb-3 flex items-center gap-2">
                      <Lock className="h-4 w-4 text-amber-300" />
                      <span className="text-[13px] font-semibold text-white">Cycle complete</span>
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
                  <>
                    <div className="mb-3 flex items-center gap-2">
                      <Lock className="h-4 w-4 text-amber-300" />
                      <span className="text-[13px] font-semibold text-white">
                        {isFreebie ? "Your free session is complete" : "This session is complete"}
                      </span>
                    </div>
                    <p className="mb-4 text-[12px] leading-5 text-slate-400">
                      {isFreebie
                        ? "You've felt what Jxl can do. The conversation picks up exactly where it left off."
                        : "The next session continues from here — nothing resets."}
                    </p>
                    {/* Single session option */}
                    <button
                      type="button"
                      onClick={() => handleCheckout("session_1")}
                      disabled={checkoutLoading}
                      className="w-full rounded-[18px] bg-amber-300 px-5 py-3 text-left transition hover:bg-amber-200 disabled:opacity-60"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[13px] font-semibold text-slate-950">Continue</p>
                          <p className="text-[11px] text-slate-800">6 replies · nothing resets</p>
                        </div>
                        <span className="text-[16px] font-bold text-slate-950">$4.99</span>
                      </div>
                    </button>

                    {/* Subscription option */}
                    <button
                      type="button"
                      onClick={() => handleCheckout("subscription")}
                      disabled={checkoutLoading}
                      className="w-full rounded-[16px] border border-amber-300/30 bg-amber-400/[0.06] px-5 py-3 text-left transition hover:border-amber-300/50 disabled:opacity-40"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[13px] font-semibold text-amber-200">AstroXL — $20/mo</p>
                          <p className="text-[11px] text-slate-400">Unlimited JXL + 8 readings · no cooldowns</p>
                        </div>
                        <span className="text-[12px] font-semibold text-amber-300">Best value</span>
                      </div>
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scroll anchor — sits at bottom of message list */}
          <div ref={bottomRef} className="h-4" />
        </div>

        {/* Input bar — stuck to bottom of phone frame, not the window */}
        {!showPaywall && !session?.onCycleCooldown && (
          <div className="shrink-0 border-t border-white/10 bg-[#050816]/90 px-4 py-3 backdrop-blur-xl" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
            <div className="flex items-end gap-3">
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
    </div>
  );
}