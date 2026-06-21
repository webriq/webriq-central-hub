"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { X, Sparkles, Send, ThumbsUp, ThumbsDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { UIMessage } from "ai";

// Stable transport — module-level constant avoids recreating on every render
const TRANSPORT = new DefaultChatTransport({ api: "/api/ops-chat" });

interface OpsChatProps {
  open: boolean;
  onClose: () => void;
  trigger?: { message: string; ts: number } | null;
  displayName?: string | null;
}

function TextBubble({ parts }: { parts: UIMessage["parts"] }) {
  const text = parts
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
  return <p className="text-[13px] text-slate-600 leading-relaxed m-0 whitespace-pre-wrap">{text}</p>;
}

function AIBubble({ msg }: { msg: UIMessage }) {
  const [rated, setRated] = useState<1 | -1 | null>(null);

  const hasContent = msg.parts.some(
    (p) => (p.type === "text" && p.text.trim()) || p.type === "tool-result"
  );
  if (!hasContent) return null;

  return (
    <div className="flex flex-col gap-2 items-start">
      <div className="flex items-center gap-1.5">
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, #F59E0B, #F97316)" }}
        >
          <Sparkles size={10} color="#FFF" />
        </span>
        <span className="text-[11px] font-semibold text-orange-500 uppercase tracking-wide">Ops AI</span>
      </div>

      <div className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3">
        <TextBubble parts={msg.parts} />
      </div>

      <div className="flex items-center gap-1.5 pl-0.5">
        <button
          onClick={() => setRated(1)}
          className={`p-1 rounded-md cursor-pointer transition-colors ${rated === 1 ? "text-green-600" : "text-slate-300 hover:text-slate-400"}`}
          title="Helpful"
        >
          <ThumbsUp size={13} />
        </button>
        <button
          onClick={() => setRated(-1)}
          className={`p-1 rounded-md cursor-pointer transition-colors ${rated === -1 ? "text-red-500" : "text-slate-300 hover:text-slate-400"}`}
          title="Not helpful"
        >
          <ThumbsDown size={13} />
        </button>
      </div>
    </div>
  );
}

export default function OpsChat({ open, onClose, trigger, displayName }: OpsChatProps) {
  const { messages, sendMessage, status } = useChat({ transport: TRANSPORT });
  const [input, setInput] = useState("");
  const [greeting, setGreeting] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const processedTsRef = useRef<number | undefined>(undefined);

  // Computed client-side only — new Date().getHours() returns UTC on the server
  // but local time in the browser, causing a hydration mismatch if done at render.
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
  }, []);

  const isStreaming = status === "streaming" || status === "submitted";

  // Scroll to bottom on new messages or streaming
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Auto-send trigger message from the header input bar
  useEffect(() => {
    if (open && trigger && trigger.ts !== processedTsRef.current) {
      processedTsRef.current = trigger.ts;
      sendMessage({ text: trigger.message });
    }
  }, [open, trigger, sendMessage]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    sendMessage({ text: trimmed });
    setInput("");
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div
      className="flex-shrink-0 flex flex-col h-full border-l border-slate-200 bg-slate-50 overflow-hidden transition-[width] duration-200 ease-in-out"
      style={{ width: open ? 400 : 0 }}
    >
      {open && (
        <>
          {/* Header */}
          <div className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-2.5 shrink-0">
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #F59E0B, #F97316)" }}
            >
              <Sparkles size={14} color="#FFF" />
            </span>
            <div className="flex-1">
              <div className="text-[14px] font-semibold text-slate-900">Ops Chat</div>
              <div className="text-[11px] text-slate-400">AI-powered workspace assistant</div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Close Ops Chat"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {messages.length === 0 && !isStreaming && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-5 py-12">
                <span
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-md"
                  style={{ background: "linear-gradient(135deg, #F59E0B, #F97316)" }}
                >
                  <Sparkles size={26} color="#FFF" />
                </span>
                <div className="flex flex-col gap-1">
                  <p className="text-[18px] font-bold text-slate-900 m-0 leading-tight">
                    {greeting}{displayName ? `, ${displayName.split(" ")[0]}` : ""}!
                  </p>
                  <p className="text-[13px] text-slate-500 m-0 leading-relaxed">
                    I&apos;m Ops AI — your workspace assistant.<br />
                    How can I help you today?
                  </p>
                </div>
                <div className="w-full max-w-[300px] flex flex-col gap-2 mt-1">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide text-left mb-0.5">
                    Suggestions
                  </p>
                  {[
                    "What are my high-priority tasks?",
                    "Show open tickets",
                    "What's pending in the pipeline?",
                    "Create a task for me",
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => { sendMessage({ text: s }); }}
                      className="text-[12.5px] text-slate-700 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-left hover:border-amber-300 hover:bg-amber-50/40 transition-colors cursor-pointer leading-snug"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) =>
              msg.role === "user" ? (
                <div key={msg.id} className="flex justify-end">
                  <div
                    className="max-w-[80%] px-3.5 py-2.5 rounded-[12px_12px_4px_12px]"
                    style={{ background: "#1E293B" }}
                  >
                    <p className="text-[13px] text-slate-100 m-0 leading-relaxed">
                      {msg.parts
                        .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
                        .map((p) => p.text)
                        .join("")}
                    </p>
                  </div>
                </div>
              ) : (
                <AIBubble key={msg.id} msg={msg} />
              )
            )}

            {/* Typing / streaming indicator */}
            <AnimatePresence>
              {isStreaming && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="flex items-center gap-1.5"
                >
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: "linear-gradient(135deg, #F59E0B, #F97316)" }}
                  >
                    <Sparkles size={10} color="#FFF" />
                  </span>
                  <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 flex gap-1 items-center">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-slate-300 block"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>

          {/* Footnote */}
          <div className="px-4 py-1.5 border-t border-slate-100 bg-slate-50">
            <p className="text-[11px] text-slate-400 text-center m-0">
              Live · Tasks, tickets &amp; pipeline · Sanity automation (DRAFT only)
            </p>
          </div>

          {/* Input */}
          <div className="px-4 py-3 bg-white border-t border-slate-200 flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything…"
              rows={1}
              disabled={isStreaming}
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-900 bg-slate-50 resize-none outline-none leading-relaxed max-h-24 overflow-y-auto transition-colors focus:border-amber-400 placeholder:text-slate-400 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="w-9.5 h-9.5 rounded-xl flex items-center justify-center shrink-0 transition-all cursor-pointer disabled:cursor-default"
              style={{
                background:
                  input.trim() && !isStreaming
                    ? "linear-gradient(135deg, #F59E0B, #F97316)"
                    : "#F1F5F9",
              }}
              aria-label="Send message"
            >
              <Send size={15} color={input.trim() && !isStreaming ? "#FFFFFF" : "#CBD5E1"} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
