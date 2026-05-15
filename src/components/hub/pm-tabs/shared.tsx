"use client";

import React from "react";
import type { PMSettings } from "@/hooks/use-pm-settings";

/* ── Design Tokens ─────────────────────────────────────────────────────── */

export interface Tokens {
  bg: string; card: string; border: string;
  blue: string; orange: string; sky: string;
  violet: string; green: string; amber: string; red: string;
  text: string; sub: string; muted: string;
}

export const LIGHT: Tokens = {
  bg: "#f5f4f1", card: "#ffffff", border: "rgba(0,0,0,0.08)",
  blue: "#3358F4", orange: "#d45e09", sky: "#1565c0",
  violet: "#4f46e5", green: "#15803d", amber: "#a16207", red: "#b91c1c",
  text: "rgba(10,12,30,0.90)", sub: "rgba(10,12,30,0.50)", muted: "rgba(10,12,30,0.28)",
};

export const DARK: Tokens = {
  bg: "#090c18", card: "#121726", border: "rgba(255,255,255,0.08)",
  blue: "#5b7fff", orange: "#f97316", sky: "#60a5fa",
  violet: "#818cf8", green: "#4ade80", amber: "#fbbf24", red: "#f87171",
  text: "rgba(255,255,255,0.92)", sub: "rgba(255,255,255,0.50)", muted: "rgba(255,255,255,0.28)",
};

export function getTokens(settings: PMSettings): Tokens { return settings.theme === "dark" ? DARK : LIGHT; }

export const PRODUCT_ABBREV: Record<string, string> = {
  StackShift: "SS", PublishForge: "PF", CiteForge: "CF", PipelineForge: "PpF",
};
export const PRODUCT_COLORS: Record<string, string> = {
  StackShift: "#3358F4", PublishForge: "#7C3AED", CiteForge: "#22C55E", PipelineForge: "#F97316",
};

/* ── Components ────────────────────────────────────────────────────────── */

export function ThemeCard({ children, tokens, style }: {
  children: React.ReactNode; tokens: Tokens; style?: React.CSSProperties;
}) {
  return <div style={{ background:tokens.card, borderRadius:14, border:`1px solid ${tokens.border}`, boxShadow:"0 1px 4px rgba(0,0,0,0.05)", ...style }}>{children}</div>;
}

export function ProgressBar({ pct, color, tokens }: { pct:number; color?:string; tokens:Tokens }) {
  const c = pct>=100?tokens.green:color??tokens.blue;
  return <div style={{display:"flex",alignItems:"center",gap:8}}>
    <div style={{flex:1,height:5,background:tokens===DARK?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)",borderRadius:9999,overflow:"hidden"}}>
      <div style={{width:`${pct}%`,height:"100%",background:c,borderRadius:9999,transition:"width 0.3s"}}/>
    </div>
    <span style={{fontSize:11,color:tokens.sub,width:32,textAlign:"right",fontFamily:"var(--font-mono), monospace"}}>{Math.round(pct)}%</span>
  </div>;
}

export function StatusBadge({ status, tokens }: { status:string; tokens:Tokens }) {
  const m:Record<string,{c:string;bg:string}> = {
    onboarding:{c:tokens.orange,bg:`${tokens.orange}17`},
    active:{c:tokens.green,bg:`${tokens.green}17`},
    inactive:{c:"#64748b",bg:"rgba(100,116,139,0.09)"},
  };
  const s=m[status]??m.inactive;
  return <span style={{fontSize:11,fontWeight:600,color:s.c,background:s.bg,borderRadius:6,padding:"2px 8px",border:`1px solid ${s.c}28`,whiteSpace:"nowrap"}}>{status.charAt(0).toUpperCase()+status.slice(1)}</span>;
}

export function ProductBadge({ name }: { name:string }) {
  const ab=PRODUCT_ABBREV[name]??name.slice(0,2);
  const co=PRODUCT_COLORS[name]??"#64748b";
  return <span style={{fontSize:11,fontWeight:600,color:co,background:`${co}12`,borderRadius:5,padding:"2px 7px",border:`1px solid ${co}1e`,whiteSpace:"nowrap"}}>{ab}</span>;
}

export function PriorityDot({ priority }: { priority:string }) {
  const m:Record<string,string>={CRITICAL:"#b91c1c",HIGH:"#d45e09",NORMAL:"#3358F4",LOW:"#94a3b8"};
  return <div style={{width:7,height:7,borderRadius:9999,background:m[priority]??m.NORMAL,flexShrink:0}}/>;
}

export function SectionHeader({ title, sub, action, tokens }: { title:string; sub?:string; action?:string; tokens:Tokens }) {
  return <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:14}}>
    <div>
      <div style={{fontSize:15,fontWeight:700,color:tokens.text,letterSpacing:"-0.01em"}}>{title}</div>
      {sub && <div style={{fontSize:11,color:tokens.sub,marginTop:2}}>{sub}</div>}
    </div>
    {action && <button style={{fontSize:12,color:tokens.sky,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:600,padding:0}}>{action}</button>}
  </div>;
}

export function StatCard({ value, label, color, tokens }: { value:string; label:string; color:string; tokens:Tokens }) {
  return <ThemeCard tokens={tokens} style={{padding:"18px 20px"}}>
    <div style={{fontSize:30,fontWeight:700,color,lineHeight:1,letterSpacing:"-0.02em"}}>{value}</div>
    <div style={{fontSize:12,color:tokens.sub,marginTop:5}}>{label}</div>
  </ThemeCard>;
}

export function ClientAvatar({ name, color, size }: { name:string; color:string; size?:number }) {
  const s=size??34;
  const ini=name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  return <div style={{width:s,height:s,borderRadius:9,background:color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:s*0.35,fontWeight:700,color:"#fff",flexShrink:0}}>{ini}</div>;
}

export function getClientColor(name:string):string {
  const c=["#3358F4","#d45e09","#7C3AED","#22C55E","#0ea5e9"];
  return c[name.charCodeAt(0)%c.length];
}