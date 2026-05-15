"use client";

import React from "react";

const prompts = [
  "What needs my attention today?",
  "Summarize Acme Corp\u2019s open tasks",
  "Show overdue items this week",
  "Which tasks are ready to execute?",
];

export default function OrchestrationPage() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", fontFamily: "inherit", maxWidth: 700, margin: "0 auto", padding: "28px 0" }}>
      <div style={{ marginBottom: 20, padding: "0 4px" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-gray-900, #1E293B)", letterSpacing: "-0.02em" }}>AI Assistant</div>
        <div style={{ fontSize: 11, color: "var(--color-gray-500, #94A3B8)", marginTop: 2 }}>Claude-powered · Sprint 5</div>
      </div>

      {/* Greeting card */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", padding: 18, marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(51,88,244,0.08)", border: "1px solid rgba(51,88,244,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#3358F4", flexShrink: 0 }}>✦</div>
          <div style={{ fontSize: 13, color: "var(--color-gray-600, #64748B)", lineHeight: 1.6 }}>
            Hi there! I can help you query tasks, summarize client statuses, and surface what needs your attention — using natural language. This feature is coming in Sprint 5.
          </div>
        </div>
      </div>

      {/* Prompt suggestions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: "auto" }}>
        {prompts.map((s) => (
          <button
            key={s}
            disabled
            style={{
              textAlign: "left",
              fontSize: 12,
              color: "var(--color-gray-500, #94A3B8)",
              background: "rgba(51,88,244,0.03)",
              border: "1px solid rgba(51,88,244,0.10)",
              borderRadius: 9,
              padding: "11px 13px",
              cursor: "not-allowed",
              fontFamily: "inherit",
              lineHeight: 1.4,
              opacity: 0.6,
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <input
          placeholder="Ask about your tasks, clients, or pipeline…"
          disabled
          style={{
            flex: 1,
            fontSize: 13,
            padding: "11px 15px",
            background: "#fff",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 11,
            color: "var(--color-gray-700, #475569)",
            outline: "none",
            fontFamily: "inherit",
            opacity: 0.5,
          }}
        />
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            background: "rgba(51,88,244,0.08)",
            border: "1px solid rgba(51,88,244,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            color: "#3358F4",
            flexShrink: 0,
            opacity: 0.4,
          }}
        >
          ➤
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", fontSize: 10, color: "var(--color-gray-400, #CBD5E1)", marginTop: 10 }}>
        Powered by Claude Haiku · Available Sprint 5
      </div>
    </div>
  );
}
