"use client";

import { Bell } from "lucide-react";

interface HubHeaderProps {
  title: string;
  subtitle?: string;
}

export default function HubHeader({ title, subtitle }: HubHeaderProps) {
  return (
    <header
      style={{
        height: 60,
        background: "#fff",
        borderBottom: "1px solid #E2E8F0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", lineHeight: 1.2 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: "#94A3B8", fontWeight: 400 }}>{subtitle}</div>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Search */}
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#64748B"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search projects, clients, tasks..."
            style={{
              fontSize: 13,
              padding: "7px 12px 7px 30px",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              color: "#0F172A",
              background: "#F7F8FA",
              outline: "none",
              width: 240,
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Notification bell */}
        <div style={{ position: "relative" }}>
          <button
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: "transparent",
              border: "1px solid #E2E8F0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <Bell size={18} color="#64748B" />
            <span
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#F97316",
                border: "1.5px solid #fff",
              }}
            />
          </button>
        </div>

        {/* Avatar */}
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "#3358F4",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          BD
        </div>
      </div>
    </header>
  );
}
