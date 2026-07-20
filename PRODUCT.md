# Product

## Register

product

## Platform

web

## Users

Primary users are internal WebriQ staff: PMs, developers, and admin/HR staff, each with role-aware views (PM dashboard, dev dashboard, admin dashboard, HR schema-backed tools). They use the hub throughout the workday to triage what needs attention across systems that would otherwise require separately checking Zoho, Sanity, GitHub, and Supabase. A secondary, much thinner audience is customers filling out the login-free onboarding form — a product-flow surface, not a marketing one, but one that deserves more brand polish than the internal-facing pages since it's the one place external people touch the hub directly.

## Product Purpose

An AI-powered operational layer that sits above Zoho, Sanity, GitHub, and Supabase without replacing any of them. It synthesizes classification, requirements assessment, planning, and execution data from those systems into one place, with an AI layer doing the classification/assessment/planning/digest work so PMs and developers aren't manually cross-referencing four tools to understand project state. Success is measured by how much this shortens the human decision loop — faster, more confident ops decisions because the AI layer has already done the synthesis, not just faster page loads.

## Positioning

The single AI-powered layer over your existing tools — it doesn't replace Zoho, Sanity, GitHub, or Supabase, it synthesizes them into one operational view where the AI does the classification, planning, and digest work.

## Brand Personality

Precise and trustworthy — this sits above systems of record, so every number, status, and AI-generated recommendation needs to read as accurate and traceable back to its source system. Calm and uncluttered — the hub surfaces a lot of live operational data (classifications, plans, time logs, HR records) and must do so without inducing anxiety or noise. Confident and opinionated — the AI layer should make legible recommendations and flag what needs attention, not just mirror raw records back at the user.

## Anti-references

Generic SaaS dashboard clichés: gradient hero-metric cards, cookie-cutter admin-template layouts, identical icon-in-a-box card grids. This should feel bespoke to WebriQ's actual workflow, not templated. It should also avoid reading as a toy or consumer app — this is serious daily-use internal infrastructure.

## Design Principles

- **Synthesize, don't replace.** Every screen should make it obvious this augments Zoho/Sanity/GitHub/Supabase rather than competing with them — deep links back to source systems, clear provenance on imported data, never a shadow re-implementation.
- **Calm density.** Surface a large volume of live operational data (classifications, plans, timelogs, HR records) without the page reading as noisy or anxiety-inducing. Hierarchy and restraint over cramming.
- **Opinionated AI, not passive display.** Where the AI layer has an assessment or recommendation, show it as a legible, confident claim — not just another data column indistinguishable from raw records.
- **Native-adjacent on mobile.** The installed PWA is the mobile experience, with no separate native app planned. Mobile layouts should feel considered and touch-native, not like a shrunk-down desktop table.
- **Earn trust through precision.** Numbers, statuses, and timestamps must be accurate and traceable to their source system — this is infrastructure people rely on to make real decisions, not a dashboard for vibes.

## Accessibility & Inclusion

Standard WCAG AA: solid color contrast, full keyboard navigation, visible focus states. No unusual accommodation requirements beyond good defaults — `prefers-reduced-motion` should still be respected on any motion added, per the codebase's existing convention.
