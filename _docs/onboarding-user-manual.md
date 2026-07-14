# Onboarding — User Manual

This guide explains, step by step, how to use the **Onboarding** feature — from opening the page, to creating a new project, to filling out the wizard, to handing the project over to the PM.

---

## 1. Overview

The process runs on a **120-day programme**, split into 5 phases. This manual focuses on **Phase 1 ("Onboard")**, which covers Days 1–15. Phases 2–5 are tracked afterward.

## 2. Who can use this

- **Marketing, Admin, and Super Admin users** have full access: create new projects, open any project's Timeline, and use every step of the wizard — including all checklists and the final "Complete Phase 1 & notify PM" action.
- **PM users** can open a project's Timeline and the wizard, but on a "look, don't touch" basis for most of it:
  - Steps 1–5 and 7 (Kickoff, Outcome target, Migration checklist, Content map, HTML mockup, Client sign-off) are **view-only** — fields, uploads, and checklists on those steps can't be edited.
  - Step 6 (Storage folder + KB) is the exception — PM can fully upload, organize, rename, move, and share files and folders, and add/remove credentials & links, exactly like Marketing. Only that step's checklist items stay locked.
  - PM does not see the "Complete Phase 1 & notify PM" button — completing Phase 1 stays Marketing/Admin/Super Admin's call.
  - On the Timeline itself, PM can view the full 120-day chart but doesn't get the "Start Onboarding" or "Jump to phase" controls.
- **Developer users** can open a project's Timeline to see progress across all 5 phases, but cannot open the wizard at all — Phase 1 task bars aren't clickable and no "Onboarding Wizard" button appears. Developer's own work starts once a project reaches Phase 2 onward.
- **HR users** only see the read-only Onboarding list (project names and status) — they cannot open a project's Timeline.
- **Client users** do not see the Onboarding page at all.

If a button described below doesn't appear for you, it's most likely a permissions difference, not an error.

---

## 3. Opening the Onboarding Page

1. Look at the left-hand sidebar.
2. Click **Onboarding** (it has a rocket icon).
3. This opens the main Onboarding page, showing every project currently going through the 120-day programme.

---

## 4. Understanding the Onboarding Page

When the page loads, you'll see a grid of project cards. Each card shows:

- **Project name** — e.g. "Acme Corporation Website."
- **Company name**, with a small building icon.
- **Status badge**, top-right corner, one of:
  - **Draft** — the project was created but hasn't started yet.
  - **Scheduled** — a future start date is set; it will begin automatically on that date.
  - **In Progress** — the 120-day clock is running.
- If the project is in progress: a **progress bar**, the current **day number** (e.g. "Day 6 / 120"), and the **current phase name**.
- If the project is scheduled: the date and time it will start.
- If nothing has started yet: a "Not started" label.

**Buttons on this page:**

| Button | What it does |
|---|---|
| **New Project** (top-right, only visible to Marketing/Admin) | Opens the form to create a new onboarding project. |
| Any project card | Click it to open that project's Timeline page. (Clickable for Marketing/Admin/Super Admin/PM/Developer. HR sees status only — cards aren't clickable for that role.) |

If there are no projects yet, you'll see a message and, if you have permission, a **New Project** button to start your first one.

---

## 5. Creating a New Project

Click **New Project**. This opens a guided, 3-step form. A progress indicator at the top shows which step you're on.

### Step 1 of 3: Company & Contact

1. Choose whether this is a **New company** or an **Existing company** using the toggle at the top.
   - **New company**: type the company name in the **Company name** field.
   - **Existing company**: type into the search box to look up the company already in the system. Click the correct match from the list that appears. (Click **Change** afterward if you picked the wrong one.)
2. Fill in the **Primary contact** — the main person you'll be working with at this company. Name is required.
3. Fill in **Contact email** — required, and must be a valid email address.
4. Fill in **Phone** — optional.
5. Click **Continue** to move to Step 2, or **Cancel** to leave without saving.

### Step 2 of 3: Project Details

1. Choose the **classification** — the type of engagement — by clicking one of the cards:
   - **StackShift I** — standard single-site build.
   - **StackShift II** — larger, multi-section site build.
   - **StackShift Access** — StackShift with ongoing managed support.
   - **StackShift Access Plus** — StackShift Access with a wider scope of ongoing work.
   - **PipelineForge** — build automation and deployment work.
   - **Discrete Development** — custom, one-off development work.
2. Check the **Project name** field. It fills in automatically from the company name and classification (e.g. "Acme Corporation StackShift I"). You can edit it — once you type your own text, the auto-fill stops updating it.
3. (Optional) Set a **Scheduled start** date and time. Only needed if you plan to use "Save + set schedule" in the next step.
4. Click **Continue** to move to Step 3, or **Back** to return to Step 1.

### Step 3 of 3: Review & Create

1. Review the summary: company, contact, email, phone, classification, project name, and scheduled start (if set).
2. If this is a brand-new company, a note tells you a unique **Customer ID** will be generated automatically.
3. Choose how to proceed:

| Button | What it does |
|---|---|
| **Start onboarding (Day 1 now)** | Creates the project and starts the 120-day clock immediately, right now. |
| **Just save** | Creates the project as a draft. The clock does not start — use this when you're not ready to begin yet. |
| **Save + set schedule** | Creates the project and starts the clock automatically on the date/time you picked in Step 2. Requires a scheduled start date to be set. |
| **Back** | Returns to Step 2. |

### After you create the project

You'll see a success screen:

- If this was a new company, the **Customer ID** is shown with a **Copy** button, so you can paste it elsewhere (e.g. into Zoho).
- **Back to onboarding** returns you to the main Onboarding list.
- **View project** takes you straight into the new project's Timeline.

---

## 6. The Project Timeline (Visual Chart)

Opening a project takes you to its **Timeline** — a visual chart of the full 120-day programme.

### 6.1 If the programme hasn't started yet

You'll see a simple screen instead of the chart. Marketing, Admin, and Super Admin see two options:

| Button | What it does |
|---|---|
| **Start Onboarding** | Starts the 120-day clock right now (Day 1). |
| **Jump to phase** | Lets you manually set which phase the project should start on — useful if the customer is already partway through the process outside the system. Click a phase to select it, optionally typing a note first to explain why. |

PM and Developer see the same screen without these buttons — starting the programme stays a Marketing/Admin/Super Admin action.

### 6.2 Reading the chart

Once started, the Timeline shows:

- **Header card**: company name, project name, current phase, who owns that phase, a progress bar, current day out of 120, days remaining, phases completed, and deliverables completed.
- **Reminders strip**: colored notice boxes showing what's due soon, what's overdue, or that things are on track. These only appear for Phase 1.
- **The chart itself**: 120 day-columns across the top, with today marked by a dashed orange line. Each of the 5 phases has its own colored row ("swimlane") containing its individual tasks as colored bars. The fill level of each bar shows how much of that task is done.

**Only Phase 1 bars are clickable.** Phases 2–5 are shown for visibility but tracked automatically elsewhere in the Hub — they are not something you fill in here.

### 6.3 Buttons and controls on this page

| Button / control | What it does |
|---|---|
| **Back to Onboarding** (top-left) | Returns to the main Onboarding list. |
| **Jump to phase** (Marketing/Admin/Super Admin only) | Manually re-tags which phase the project is on, with an optional note. |
| **Onboarding Wizard** (blue button, only shown while Phase 1 is active) | Opens the step-by-step wizard described in Section 8. Shown to Marketing/Admin/Super Admin and PM — not shown to Developer. |
| Clicking a Phase 1 task bar | Opens the wizard directly at that task's step. Not clickable for Developer. |
| The small checklist badge on a task bar (e.g. "2/4") | Opens a small popup list of that task's checklist items. Clicking an item jumps into the wizard at that step. Not clickable for Developer. |
| Clicking a phase's name/icon on the left | Collapses or expands that phase's row. |
| Orange circular button, bottom-right (compass/pin icon) | Scrolls the chart back to today's date. |
| Scrolling / trackpad swipe over the chart | Pans left and right through the 120 days. |

Developer sees the chart itself (all 5 phases, read-only) but none of the action buttons above.

---

## 7. Opening the Onboarding Wizard

The wizard is where you actually do the Phase 1 work. Open it either:

- By clicking the **Onboarding Wizard** button on the Timeline page, or
- By clicking directly on any Phase 1 task bar or checklist item.

**Developer cannot open the wizard** — this section and Section 8 apply to Marketing, Admin, Super Admin, and PM only. For PM, the wizard opens in a mostly view-only mode: Steps 1–5 and 7 show existing content but nothing can be typed, uploaded, or checked off; Step 6 (Storage folder + KB) is the one step PM can fully work in. See each step below for exactly what's locked.

The wizard has **7 steps**, shown as numbered circles across the top, one for each Phase 1 task, in day order:

1. Kickoff (Days 1–2)
2. Outcome target (Days 3–4)
3. Migration checklist (Days 5–9)
4. 90-day content map (Days 10–11)
5. HTML mockup (Days 12–13)
6. Storage folder + KB (Day 14)
7. Client call — sign-off (Day 15)

A counter near the top-right shows how many of the 7 tasks are fully complete (e.g. "3/7").

**Navigating between steps:**

| Button | What it does |
|---|---|
| **Continue** | Saves your progress and moves to the next step. Blocked if a required field or checklist item on the current step isn't filled in yet — see the note below. |
| **Back to timeline** / **Previous step** | Goes back one step, or back to the Timeline if you're on the first step. |
| **Cancel** | On the first step, leaves the wizard and returns to the Timeline. |
| Clicking a step number directly | Not available — steps are visited in order via Continue/Back, but you can always come back later since your entries are saved. |

**Everything you type or upload saves automatically** a couple of seconds after you stop typing. A small status indicator near the top of each step tells you when it's saved.

**If you try to continue with something missing:** a pop-up lists exactly what's incomplete. From there you can:
- Go back and fill it in, or
- Click **Mark all as done** to check everything off at once (only works if nothing required is missing), or
- If a required item is still missing, confirm you want to proceed anyway — this flags the gap to the PM instead of blocking you.

This "something missing" check doesn't apply to PM — since PM's fields are view-only anyway, **Continue** always just moves to the next step.

---

## 8. Filling Out Each Wizard Step

### Step 1: Kickoff

Purpose: capture everything learned from the first conversations with the client.

- **Contacts** — add at least one contact with a name and valid email (position, phone, and social media are optional). Use the **Add contact** control to add more than one.
- **Current website URL** — the client's existing site link, if any. Leave blank if none.
- **Competitor / reference URLs** — add reference websites one at a time as tags.
- **Business facts** — a formatted text box (bold, headings, lists, etc.) describing the company: history, services, value proposition, target customers. Required — either type here or attach a file below it.
- **Additional Notes** — anything else from the kickoff call. Optional.
- **Checklist**, below the fields:
  - Kickoff meeting held
  - Contacts confirmed *(can't be checked until a valid contact is added)*
  - Goals, timeline and other important details filed *(can't be checked until Business facts is filled in or a file is attached)*

### Step 2: Outcome Target

Purpose: record what success looks like for this customer over the 120 days.

- Type the agreed, measurable outcomes in the text box (e.g. "Increase organic traffic 40% by Day 90"), **or** upload a document instead using the box on the right.
- Checklist item: **Agreed measurable outcomes filed** — auto-progresses once you start filling this in, or once Day 3 arrives.

### Step 3: Migration Checklist

Purpose: audit what the client already has, ahead of migrating their content.

- Type the migration checklist / audit notes, **or** upload a document (e.g. a site audit spreadsheet) instead.
- Checklist item: **Implementation file**.

### Step 4: 90-Day Content Map

Purpose: plan what content will be created and when, for the first 90 days.

- Type the content clusters and publishing schedule, **or** upload a document (e.g. a content calendar) instead.
- Checklist items:
  - Cluster topics & schedules
  - Publishing plan

### Step 5: HTML Mockup

Purpose: share the visual mockup of the new site for client approval.

- Upload the mockup file(s). HTML files can be opened and edited right inside the browser after uploading.
- Checklist item: **HTML and MD files** *(can't be checked until at least one file is uploaded)*.

### Step 6: Storage Folder + KB

Purpose: the shared filing cabinet for this project — every document, credential, and link the team needs. See Section 9 for the full breakdown of file and folder actions.

This is the one step PM can fully edit, same as Marketing/Admin/Super Admin — uploading, organizing, and sharing files works identically for PM here. Only this step's checklist items (below) stay locked for PM.

- **Project files** — a full File Explorer for uploading, organizing, and sharing files.
- **Credentials & links** — a separate list for non-file items like DNS access or login details.
- Checklist items:
  - Branding guides
  - KB info (raw)
  - DNS details
  - Credentials (for external integrations)

### Step 7: Client Call — Sign-off

Purpose: document the final sign-off call before handing over to the PM.

- Type the sign-off call notes, **or** upload the signed agreement instead.
- Checklist items:
  - Sign-off call held with the client, PM joining for handover
  - Scope, mockup, and migration plan approval recorded *(can't be checked until notes are typed or the agreement is attached)*

This is the last step. Once here, the **Continue** button is replaced by **Complete Phase 1 & notify PM** — see Section 10.

---

## 9. Managing Files and Folders (Storage Folder + KB step)

This is the most detailed part of the wizard. Everything below lives inside the **Project files** panel on Step 6.

### 9.1 Folders

The project automatically comes with these starter folders (these cannot be deleted or renamed away):

- **Business Files** (with three sub-folders inside it: **Branding**, **Proposals**, **Collateral**)
- **Outcome Target**
- **Checklist**
- **Content Map**
- **HTML Mockup**
- **Other**

At the top of the panel, you'll see your current location shown as a trail of folder names (a breadcrumb). Click any name in that trail to jump back to that folder.

| Button | What it does |
|---|---|
| **New folder** | Creates a new folder in your current location. Type a name and click **Create**. |
| Clicking a folder | Opens that folder. |
| **⋮** (three-dot menu) on a folder | Opens a small menu — see below. |
| **New sub-folder** (in folder's ⋮ menu) | Creates a folder inside that folder. |
| **Permissions** (in folder's ⋮ menu) | Controls who can see this folder — see Section 9.4. |
| **Rename** (in folder's ⋮ menu) | Renames the folder. |
| **Delete** (in folder's ⋮ menu) | Deletes the folder. Disabled (greyed out) if the folder is a starter/system folder or still has files/sub-folders inside it — empty it first. |

### 9.2 Files

| Button | What it does |
|---|---|
| **Add file** | Opens your device's file picker to upload a file into the folder you're currently in. |
| **Grid view** / **List view** (icons near the top) | Switches how files are displayed. |
| Clicking a file | Selects it (for the bulk actions described in 9.3) — it does not open it. |
| **⋮** (three-dot menu) on a file | Opens a menu with: |
| — **View** | Opens an in-app preview of the file. |
| — **Permissions** | Controls who can see this specific file. |
| — **Rename** | Changes the file's display name. |
| — **Move to folder** | Moves the file into a different folder. |
| — **Remove** | Deletes the file. |

### 9.3 Selecting multiple files at once

Click on one or more files to select them. A toolbar appears showing how many are selected, with:

| Button | What it does |
|---|---|
| **X** (clear) | Deselects everything. |
| **Share** icon | Opens a panel to set permissions for all selected files at once (see 9.4), then click **Apply to [n] files**. |
| **Move to folder** icon | Moves all selected files into a chosen folder at once. |
| **Delete** (trash icon) | Deletes all selected files at once. |

### 9.4 Permissions (who can see a file or folder)

Opening **Permissions** on a file or folder lets you control visibility:

- **All roles** — clears restrictions; anyone with normal Hub access can see it.
- Individual role toggles — **Super Admin**, **Admin**, **PM**, **Developer** — restrict visibility to just the roles you turn on.
- **Share with specific people** — search the staff directory and add individual people, regardless of their role.

### 9.5 Credentials & links

Below the File Explorer is a separate list for things that aren't files — logins, API keys, external tool links, etc.

1. Click **Add** next to "Credentials & links."
2. Choose the **Type**: **Link** or **Credential**.
   - **Link**: enter a **Label** and the **Value** (a full URL).
   - **Credential**: enter a **Label**, then one or more field pairs (e.g. "Username" / the actual username). Each field has a **Sensitive** switch — when on, the value is masked (shown as dots) until someone clicks **Show**.
3. Optionally restrict who can see it, the same way as file permissions (by role or by specific person).
4. Click **Save** (or the modal's submit action) to add it to the list.

Each entry in the list shows a type tag (**LINK** or **CRED**), its label, its value(s), and:
- **Open** (links only) — opens the URL in a new tab.
- **Trash icon** — removes the entry.

---

## 10. Completing Phase 1 & Notifying the PM

This section applies to Marketing, Admin, and Super Admin only — PM sees Step 7 in view-only mode with no "Complete Phase 1 & notify PM" button, and Developer never reaches the wizard at all.

Once you've reached Step 7 (Client Call — Sign-off) and are ready to close out Phase 1:

1. If any of the 7 tasks aren't fully marked done yet, a yellow warning box tells you how many are outstanding. You can still proceed — outstanding items are simply flagged to the PM.
2. A second note explains what happens next: the PM is notified, the project becomes visible elsewhere in the Hub (Customers/Projects), and Day 16 tracking (Phase 2) begins.
3. Click **Complete Phase 1 & notify PM**.

If any checklist items on the current step aren't done, you'll see the same "what's missing" pop-up described in Section 7 before it lets you finish.

After clicking, a short closing animation plays, followed by a summary screen showing:

- How many deliverables were marked done.
- How many internal checklist items were marked done.
- How many files were uploaded to the project folder.
- Confirmation that the PM was notified.

Click **Back to Onboarding Timeline** to return. The project now shows Phase 2 as active, and it becomes visible to the PM and wider team.

---

## 11. Quick Reference — All Buttons at a Glance

| Location | Button | Purpose |
|---|---|---|
| Onboarding page | **New Project** | Start creating a new onboarding project. |
| New Project — Step 1 | **Continue / Cancel** | Move to Step 2, or leave without saving. |
| New Project — Step 2 | **Continue / Back** | Move to Step 3, or return to Step 1. |
| New Project — Step 3 | **Start onboarding (Day 1 now)** | Create the project and start the clock immediately. |
| New Project — Step 3 | **Just save** | Create the project as a draft; clock not started. |
| New Project — Step 3 | **Save + set schedule** | Create the project; clock starts automatically on the chosen date. |
| Success screen | **Copy** | Copies the new Customer ID to your clipboard. |
| Success screen | **Back to onboarding / View project** | Return to the list, or open the new project. |
| Timeline (not started) | **Start Onboarding** | Begin Day 1 right now. Marketing/Admin/Super Admin only. |
| Timeline (not started) | **Jump to phase** | Manually tag the project's starting phase. Marketing/Admin/Super Admin only. |
| Timeline | **Onboarding Wizard** | Open the step-by-step wizard for Phase 1. Marketing/Admin/Super Admin/PM — not Developer. |
| Timeline | Orange circular button | Scroll the chart back to today. |
| Wizard, Steps 1–5 & 7 | **Continue / Previous step / Cancel** | Move between steps. Available to everyone who can open the wizard, including read-only PM. |
| Wizard, Steps 1–5 & 7 | Text fields, uploads, checklist toggles | Marketing/Admin/Super Admin only — view-only for PM. |
| Wizard | **Mark all as done** | Check off all remaining checklist items on the current step. Marketing/Admin/Super Admin only. |
| Wizard, Step 6 | **Add file** | Upload a file into the current folder. Marketing/Admin/Super Admin and PM. |
| Wizard, Step 6 | **New folder** | Create a folder. Marketing/Admin/Super Admin and PM. |
| Wizard, Step 6 | **Grid view / List view** | Change how files are displayed. |
| Wizard, Step 6 | **⋮ menu → View / Permissions / Rename / Move to folder / Remove** | Manage an individual file. Marketing/Admin/Super Admin and PM. |
| Wizard, Step 6 | **⋮ menu → New sub-folder / Permissions / Rename / Delete** | Manage a folder. Marketing/Admin/Super Admin and PM. |
| Wizard, Step 6 | **Add** (Credentials & links) | Add a non-file credential or link. Marketing/Admin/Super Admin and PM. |
| Wizard, Step 6 checklist | Checklist toggles | Marketing/Admin/Super Admin only — locked for PM, same as every other step's checklist. |
| Wizard, Step 7 | **Complete Phase 1 & notify PM** | Finish Phase 1, notify the PM, and hand the project over. Marketing/Admin/Super Admin only — not shown to PM. |
