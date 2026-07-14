# Onboarding Feature — Presentation Walkthrough Guide

---

Thank you for the introduction. Good afternoon, everyone. My name is Brandon, and I'll be presenting the feature we've been working on. I'll walk you through the functionality, explain the implementation, and then we'll be happy to answer any questions or discuss your feedback.

So, what is the Onboarding feature? Simply put, it's our new system for bringing a customer on board — managing everything from the moment we decide to work with them, through all the preparation work, right up to the point where we hand the project over to the Project Manager and the development team. It replaces a lot of manual work and scattered communication with one clear, guided process.

Let me show you how it works.

---

## Landing on the Onboarding Page

When you first open the Onboarding tab, you land on the main dashboard. It's clean — a heading that says "Onboarding" with a rocket icon, and below that, a grid of project cards.

Now, what you see depends on who you are. Marketing and admin users see the full picture — all projects across every stage, plus a big "New Project" button. PMs and staff see a read-only view of Phase 1 projects only. This is intentional — Phase 1 is Marketing's responsibility, and PMs only get involved once the project is handed over.

Each card tells you at a glance what you need to know: the project name, which company it's for, and its current status. There are three statuses:

- **Draft** — the project has been created but not started yet. It's saved, waiting for the right moment.
- **Scheduled** — the project has a future start date locked in.
- **In Progress** — the 120-day clock is ticking.

For projects in progress, the card also shows a progress bar — Day X of 120 — and which phase they're currently in. You can click any active card to dive in.

If there are no projects yet, you see a friendly prompt encouraging you to start your first intake.

---

## Creating a New Project

Clicking "New Project" opens a three-step form. It's designed to be fast and guided, so you don't miss anything important.

### Step 1: Company & Contact

The first question: are we working with a brand-new company, or an existing customer?

If they're **new**, you just type the company name. That's it.

If they're **existing**, you switch the toggle and search for them. Start typing the company name, and matching results from our customer database appear instantly. Click the right one, and it locks in — showing the full company name and their customer ID so you know you've got the right record.

Then, you add the contact person. Just a name and an email, both required. If the email doesn't look valid, it tells you right away.

### Step 2: Project Details

This is where you classify what kind of work we're doing. We have six options, and I'll walk through them:

- **StackShift I** — a standard website build, single site
- **StackShift II** — a larger, multi-section website
- **StackShift Access** — ongoing managed access and support
- **StackShift Access Plus** — same, but with an expanded scope
- **PipelineForge** — build and deployment automation
- **Discrete Development** — custom one-off development work

Each option has its own card with a description and icon, so you know exactly what you're picking. Click one — a checkmark animates in, and the card lights up in its own color.

The project name fills in automatically based on the company name and the type of engagement. For example, "Acme Corporation" becomes "Acme Corporation Website" or "Acme Corporation App." You can edit it freely — once you do, the auto-fill stops.

### Step 3: Review & Create

The final step summarizes everything: which company, who the contact is, and the project details. This is your chance to double-check before creating.

And here's an important decision point — you have three options for how to proceed:

1. **"Start onboarding (Day 1 now)"** — this is the big blue button. It creates the project and starts the 120-day clock immediately. Use this when you're ready to begin work right away.

2. **"Just save"** — this saves the project as a draft without starting the clock. Handy if you're entering information ahead of time but the work hasn't begun yet.

3. **"Save + set schedule"** — this saves the project and sets a future start date. The system will automatically start the programme when that date arrives — you don't have to come back and do it manually.

Once created, you see a success screen with the project name. If this was a brand-new customer, you also get their unique customer ID right there with a copy button — easy to paste into Zoho or share with the team. From here, you can either go back to the main list or jump straight into the project.

---

## Inside a Project — The Timeline

When you open a project, the first thing you see is the big picture: a 120-day timeline laid out as a visual chart. Think of it as a bird's-eye view of the entire customer journey.

Across the top, you see the dates. A vertical orange line marks today. You can scroll horizontally to see the full 120 days.

The timeline is divided into **five phases**, each in its own color:

| Phase | Name | Duration | What Happens |
|-------|------|----------|-------------|
| 1 | Onboard | Days 1–15 | Marketing gathers everything needed — contacts, goals, content plans, mockups |
| 2 | Migrate & Rebrand | Days 16–30 | Development and rebranding work |
| 3 | Launch & Optimize | Days 31–60 | Going live and fine-tuning |
| 4 | Grow & Scale | Days 61–90 | Expanding and scaling |
| 5 | Handover & Review | Days 91–120 | Final review and handover |

Inside each phase are individual tasks, shown as colored bars. The fill level shows progress — how much of that task is done.

The header also shows a reminders panel at the top. This is like a smart assistant — it tells you what's due soon, what's overdue, and whether things are on track, specifically for Phase 1.

Now, one important thing: **only Phase 1 is interactive**. That's because Phase 1 is where Marketing does all the groundwork before handing off to the PM. From Phase 2 onwards, the tracking is automated and visible, but the hands-on work happens in other parts of the Hub.

If the programme hasn't started yet, you instead see a simple screen with two choices: "Start Onboarding" to begin Day 1 right now, or "Jump to Phase" if the customer is already further along and you need to skip ahead. The Jump option lets you pick any phase and add an optional note explaining why.

---

## The Phase 1 Wizard — Step by Step

This is the core of the feature. Clicking any Phase 1 task on the timeline opens the Onboarding Wizard. It guides you through seven steps, one for each deliverable in Phase 1. Let me walk through each of them and explain *why* each one matters.

### Step 1: Kickoff (Days 1–2)

This is your first interaction with the customer. The purpose is to capture everything you learn during the initial conversations.

**What you fill in:**

- **Contacts** — who are we communicating with? You add at least one primary contact with their name, email, position, phone, and social media. You can add as many additional contacts as needed. This ensures the team knows exactly who to reach out to.

- **Current website URL** — if they have an existing site, paste the link here. Helps the team understand the starting point.

- **Competitor or reference URLs** — websites they admire or want to compete with. Add them as tags, one by one. This gives the designer and developer visual references.

- **Business facts** — this is a rich text area. Describe the company: their history, services, value proposition, target customers. You can format it with headings, bold, lists — make it readable. Alternatively, attach a document.

- **Additional notes** — anything else that came up in the kickoff call.

There's also a **checklist** beneath the fields. These are internal to-dos that gate the step — for example, "Kickoff meeting held," "Contacts confirmed," and "Goals and timeline filed." You check them off as you complete them. Some items are smart-gated — for example, you can't mark "Contacts confirmed" until you've actually added a contact with a valid name and email. This prevents accidentally marking things as done before they really are.

Everything you type saves automatically. You don't have to click save — just type and move on. A small indicator at the top tells you when your changes are saved.

### Step 2: Outcome Target (Days 3–4)

What does success look like for this customer? That's what this step captures — the agreed, measurable outcomes for the 120-day programme.

Write them out — more traffic? More leads? A better brand presence? Specific page launches? You can also attach a document if the outcomes were shared in a proposal or email. The checklist has one item: that these outcomes are actually filed.

### Step 3: Migration Checklist (Days 5–9)

This is where you audit what the customer already has. What pages exist? What content needs to move? What can be left behind? This step serves as the full inventory before migration begins. It's a rich text field with file attachments — you can create a structured document right here, or attach a spreadsheet.

### Step 4: 90-Day Content Map (Days 10–11)

What content are we creating, and when? This step is for laying out the topics, content clusters, and publishing schedule for the first 90 days. Having this documented means the content team knows exactly what's expected and when.

### Step 5: HTML Mockup (Days 12–13)

Now we get visual. Upload the mockup files that show what the new site will look like. This step includes an in-app preview — you can view images, HTML files, and even edit HTML mockups directly in the browser. The checklist gates this step until at least one mockup file is uploaded.

### Step 6: Storage Folder & Knowledge Base (Day 14)

This is the hub for all the project's files and credentials. Think of it as the shared filing cabinet.

The **File Explorer** organizes everything into folders — Business Files, Branding, Proposals, Collateral, and more. You can drag files between folders, rename them, create new folders, and set permissions — choosing which team members can access each folder.

There's also a **Credentials & Links** section. This is where you store non-file assets: DNS login details, HubSpot credentials, payment gateway access, external integration keys — anything the team needs that isn't a document.

The checklist here is the most extensive: project folder live, knowledge base populated, all deliverables filed, HTML mockup complete, and client call completed.

### Step 7: Client Call — Sign-off (Day 15)

The final step. This is where you document the sign-off call with the client. Write up the meeting notes — what was agreed, what the scope is, and confirmation that the mockup and migration plan are approved. Attach a signed agreement if available.

The checklist has two items: that the call was held, and that the agreement is recorded.

---

## Navigating the Wizard

A few things to point out about how the wizard works day to day:

- **You can move freely between steps.** Completed steps show a checkmark; the current step is highlighted. Click "Previous step" or use the stepper bar at the top. This is not a rigid, locked sequence — you can go back and update earlier steps at any time.

- **Everything autosaves.** Every text field, every uploaded file, every checklist toggle — it all saves automatically after a brief pause. No more losing work because you forgot to hit save.

- **Validation is gentle but firm.** You can't advance past a step if it has required but incomplete checklist items. The wizard shows a modal listing what's missing, giving you the option to go back and fix it, mark everything as done, or — if the missing items involve required data — confirm that you want to proceed anyway.

- **The last step is special.** When you're on Step 7, the "Continue" button becomes "Complete Phase 1." Below it, you see a warning if any earlier deliverables aren't done, and a note explaining what will happen: the PM gets notified, the project becomes visible across the Hub, and Phase 2 tracking begins.

---

## Completing Phase 1

When you click "Complete Phase 1 & notify PM," the system walks through a closing animation. You see six milestones appear one by one with checkmarks:

1. All 7 deliverables marked done
2. Internal checklist items filed
3. Project folder populated with all assets
4. Client sign-off completed
5. PM notified
6. Project visible in Customers/Projects

This is more than just a visual effect — it's a confirmation that each of these things has actually happened.

Once complete, you see a summary screen: how many deliverables were done, how many internal items were checked off, how many files were uploaded. And the key message: "PM notified — Phase 2 begins."

At this point, the project transitions from Marketing's hands to the PM's. The project is now visible to the wider team, and the Gantt chart shows Phase 2 as active.

---

## Summary

So that's the Onboarding feature — from clicking the tab, to creating a project, through all seven wizard steps, and the handover to PM.

The goal was to replace scattered emails, spreadsheets, and manual tracking with one clear system where:

- Every stakeholder knows exactly what stage a project is in
- Marketing has a guided workflow that ensures nothing is missed
- PMs receive complete, organized handoffs instead of chasing information
- Files, credentials, and notes live in one place, organized by project
- Progress is visible at a glance through the timeline and progress indicators

I'm happy to walk through any part of this again in more detail, or take your questions and feedback. Thank you.
