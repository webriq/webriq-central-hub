# Central Hub — Onboarding Module: Feature List

Running list of features for the developer. Plain requirements — implementation is up to the developer.

---

## 1. Client classification & management

- Existing clients in Central Hub can be tagged as **Legacy client**.
- Newly added clients can be classified as one of:
  - **StackShift I**
  - **StackShift Access**
  - **StackShift Access Plus**
- User roles who manage/view this: **Super Admin, PM, Bert account**.
- **Super Admin** can add new classification types in the future (e.g. when new products are launched), without needing a developer to hard-code it.
- The client list is **filterable by classification**, so staff can quickly see which clients fall under which type.

---

## 2. Phase 1 — Onboard (Day 1–15, owner: Bert)

- A **start button** (or similar action) in Central Hub to mark that a client has begun the process at Day 1 (Onboarding phase).
- Since some clients skip ahead, **Bert or PMs can manually tag a client** to whichever phase they're actually starting from instead of always Day 1:
  - Migrate & Rebrand (Day 16–30)
  - Publishing Phase 1 (Day 31–60)
  - Publishing Phase 2 (Day 61–90)
  - Publishing Phase 3 (Day 90–91)
  - **Other** — free text/custom phase entry
- Assuming a client starts at Day 1, **Bert can upload client files**: images, PDFs, Word docs, spreadsheets, links to other locations, HTML files, MD files.
- Central Hub **tracks where each client currently is** in the process and **sends reminders to users** for upcoming/overdue timelines.
- Uploaded files have **permissions in place** and are **shareable to specific users on demand**.

---

## 3. Phase 2 — Migrate & Rebrand (Day 16–30, handover to developer)

- At Day 16, **PM is reminded** — this marks the start of the handover to the developer.
- **Developer's dashboard** shows the new task for this client, with **deadline auto-set to Day 30**.
- **Reminders sent to the developer every 5 days** prompting them to update their project status.
- **Bert, PM, and Super Admin** can filter/see in Central Hub which projects are in which stage of the 120-day process.
- These roles also **get reminders when a project is running late**.

---
