# WebriQ Central Hub App

**Technical Specs:** [Zoho WorkDrive](https://workdrive.zoho.com/file/jpsrm47d56d0adb234d8b91131339d770d397)

---

## Overview

### Main Features

| # | Feature |
|---|---------|
| A | Onboarding and Client Information Hub |
| B | Project Management |
| C | Developer Task Logging and Timesheets |

### Access Control

- Role-based permissions: **Admin, PM, Developer, Client**
- Multi-tenant support

### Reporting and Prompt Interface

- Onboarding completion metrics
- Project progress reports
- Team performance dashboards
- Prompt-based operational queries for PMs

### Tech Stack

- **Database:** Supabase
- **Integrations:** Zoho Desk, Zoho Projects, Zoho Cliq

---

## A. Onboarding and Client Information Hub

### 1. Unified Onboarding Entry Point

- One link per customer
- URL pattern: `/onboard/{customer-id}`

---

### 2. Dynamic Onboarding Form

Conditional logic based on product selected; modular sections reusable across products.

**Example Sections:**

- Company Info
- Contacts / Stakeholders
- Project Goals
- Content / Assets
- Technical Requirements

**Product-to-Section Mapping:**

| Product | Sections Used |
|---------|--------------|
| StackShift | A, B, C |
| PipelineForge | A, D, E |

---

### 3. Product Tagging Layer

Products available for onboarding:

- StackShift — Content Site & Discrete Development
- PublishForge
- CiteForge
- PipelineForge

Product tagging drives:

- What questions appear
- What data is required
- What gets exposed later

---

### 4. Progressive Completion

**User capabilities:**

- Save progress and resume later
- Share incomplete form via a secure link for the customer to complete (no login required)
- Upload assets: images, PDFs, Word documents, spreadsheets

**PM visibility example:**

```
Status: 40% complete
Missing: assets, stakeholder contacts
```

**Expandability:**

- Clients can be tagged for additional products over time within the same profile
- For now: PM inputs product links manually (e.g., StackShift link, PublishForge link)
- Future: automate this process

---

### 5. Centralized Customer Profile

A structured, clean view of the customer once onboarding is complete (or partially complete).

```
Customer
├── Company Info
├── Primary Contact
├── Metadata (industry, region, etc.)
├── Products Activated
│   ├── StackShift (link to instance)
│   │   └── Website wireframes and branding documents
│   ├── PublishForge (link to instance)
│   │   └── Content inputs and knowledgebase materials
│   └── PipelineForge (link to instance)
│       └── Knowledgebase materials or email list
└── Assets
    ├── Files
    ├── Links
    └── Credentials (handled carefully — e.g., DNS access, email tool access)
```

---

### 6. Data Retrieval Across Products

**Phase 1 — Lightweight:**

- Each product links back to the Hub
- Products pull data via API (read-only initially)

**Example:**

> In StackShift → "View Customer Info" opens Hub, or fetches key fields via API

---

### 7. Customer ID Standard

Every system must rely on a `customer_id`:

- Created in the Hub
- Used across all products
- Never duplicated

---

### MVP Scope

- [x] Customer creation
- [x] Onboarding form (modular + dynamic)
- [x] Data storage (structured)
- [x] Basic PM dashboard (completion tracking)
- [x] Simple API for retrieval
- [x] Link access from other products

---

## B. Project Management

> Integrated with **Zoho Projects** and **Zoho Desk** via MCP. Prompt-enabled for PMs.

---

### Project Operations Module

- Auto-create Zoho Project after onboarding
- Create tasks from the Hub
- Assign developers from the Hub
- Update project and task statuses from the Hub
- View project progress and pending review items

---

### Ticket Operations Module

- Pull open tickets from Zoho Desk
- Manual or automated ticket assignment
- Bulk ticket view for daily triage
- Ticket reassignment by PM
- Surface completed or for-checking tickets

---

### Auto Assignment Engine

- Round robin assignment for selected developer groups
- Configurable rules by ticket type, queue, priority, or workload
- PM override for reassignment
- Exclusion rules for absent or unavailable developers

---

### Zoho Integration Layer

- Sync projects with Zoho Projects
- Sync tickets with Zoho Desk
- Use MCP for operational actions and retrieval
- Webhooks for real-time updates
- Two-way synchronization with audit trail
- Sync customer data with Zoho CRM if needed later

---

### Daily Project Task Management

**Flow:**

1. PM creates new customer via onboarding → triggers new Zoho Project (blank template)
2. Hub stores: `customer_id`, `zoho_project_id`, product type, PM owner, project status
3. PM creates or defines project tasks in the Hub → Hub pushes tasks to Zoho Projects
4. PM assigns tasks to developers from the Hub → syncs to Zoho Projects
5. PM updates project/task status from the Hub → syncs back to Zoho Projects

**Priority Levels:** Top Priority · Urgent · Normal · Low Priority

**Dedicated Developers:**
- PMs can mark a client/project with dedicated developer(s)
- Future tasks and tickets auto-assign to dedicated developers
- Dedicated developers are changeable

**Direct Link Access:**
- Click on a task or ticket to open it directly in Zoho — no manual searching required

---

### PM Project Actions

| Action | Description |
|--------|-------------|
| Open project | Set project to active |
| Put on hold | Pause project |
| Mark active | Resume project |
| Mark for review | Flag for PM checking |
| Close project | Complete and archive |
| Reopen project | Reactivate if needed |

---

### Field Editing Rules

> ⚠️ To be defined with the developer:
> - Which fields can be edited in the Hub
> - Which fields can be edited directly in Zoho
> - What happens when both change simultaneously

---

### Ticket Management

**PM Prompt Examples:**

```
"What are today's open tickets?"
"Show all unassigned tickets"
"What tickets are waiting for PM review?"
"Show urgent open tickets"
```

**Suggested Ticket Views:**

- Open Today
- Unassigned
- Assigned / In Progress
- Waiting for Checking
- Overdue
- High Priority

---

### Daily Ticket Management Flow

1. Hub pulls open tickets from Zoho Desk
2. PM requests open tickets for today or all current open tickets
3. Hub lists tickets in a PM-friendly queue
4. PM reviews current developer workload before assignment
5. PM assigns manually or via automation → syncs to Zoho Desk
6. Completed or for-review tickets surface back in the Hub

---

### Round Robin Assignment — Guardrails

**Eligible Ticket Queue:** Projects without a dedicated developer

**Eligible Developer Pool (not):**
- Working on top priority clients
- On leave
- Assigned to urgent tasks

**Rules:**

- PM sets a pool of available developers; changes apply the next day
- Skip absent developers
- Skip developers above the load threshold (configurable by PM)
- Cap tickets per developer
- Allow PM override
- Log assignment reason: `auto-assigned` or `manually assigned by PM`

**Minimum Assignment Logic:**

```
For each open ticket:
1. Check if ticket qualifies for auto-assignment
2. Choose next available developer in queue
3. Verify developer is not absent and is below cap (via Zoho People)
4. Assign ticket
5. Record assignment reason and timestamp
```

**PM Override Capabilities:**

- Cancel auto-assignment
- Reassign manually
- Exclude a developer from today's run
- Rerun assignment for leftover tickets

---

### Review and Closure Workflow

1. Developer completes task or ticket
2. Hub receives sync or webhook event from Zoho
3. PM is notified that item is ready for checking
4. PM queries Hub for items ready for checking or closing
5. PM reviews and closes item from the Hub
6. Final state syncs back to Zoho

**Event Triggers:**

- Task status changed to `completed`
- Ticket status changed to `resolved` / `for review`
- Reassignment happened
- Overdue item detected
- Blocked task flagged

**Delivery Options:**

- In-hub notification
- Email
- Zoho Cliq (TBD)

---

### Time and Hours Tracking

Hub pulls logged hours from Zoho Projects.

**PM Prompt Examples:**

```
"How many hours did John log this week?"
"Show total hours spent on Project X this month"
"List hours logged for all CiteForge tasks last week"
"Compare logged hours by developer for March 2026"
```

**Core Data Objects:**

| Field | Description |
|-------|-------------|
| `time_log_id` | Unique log identifier |
| `developer_id` | Developer reference |
| `task_id` | Task reference |
| `project_id` | Project reference |
| `date_logged` | Date of log |
| `hours` | Hours logged |
| `billable` | Billable / non-billable flag |

**Output Formats:**

- Quick prompt answers
- Standard UI filters
- Tabulated view
- Export data feature

---

### PM MVP — Build Order

**Phase 1:**

Project Side:
- [x] Auto-create Zoho project from onboarding
- [x] Create tasks from Hub
- [x] Assign developers
- [x] Update project/task status
- [x] Show tasks ready for checking

Ticket Side:
- [x] List open tickets from Zoho Desk
- [x] Manual assignment
- [x] Reassignment
- [x] Show tickets ready for PM checking

Reporting Side:
- [x] Basic hours lookup by developer and project

**Phase 2:**

- [ ] Round robin auto-assignment
- [ ] Workload-aware assignment
- [ ] Richer notifications
- [ ] Deeper prompt workflows
- [ ] Smarter reporting

---

## C. Developer Workflow

### Overview

The developer experience in the Hub is intentionally **lightweight**. The Hub does not replace Zoho Projects or Zoho Desk for execution — it serves as a **daily operational dashboard and access layer**.

**Developers will still:**

- Review full task details in Zoho Projects
- Handle tickets in Zoho Desk
- Log hours directly in Zoho

**The Hub acts as:**

- Daily task reminder
- Quick access panel
- Prompt-based assistant for workload and time tracking

---

### Daily Task and Ticket View

Developers see a dashboard of:

- Tasks assigned for the day
- Tickets assigned for the day
- Pending tasks from previous days
- Overdue items

**Grouped by:**

- Tasks (Zoho Projects)
- Tickets (Zoho Desk)

---

### Quick Access Links

- Each task or ticket includes a **direct link to Zoho**
- Clicking opens the exact task or ticket in Zoho
- All detailed work (comments, updates, time logging) is done in Zoho

---

### Open Work Awareness

Dashboard indicators:

```
"You have 3 open tasks"
"2 tickets pending"
```

---

### Proactive Task Retrieval

**Developer prompts:**

```
"What open tasks do I have?"
"Show my pending tickets"
"Are there any other open tasks for the team?"
```

**Team-wide open task panel:**

- Developers can view a UI panel listing all open and unassigned team tasks
- Developer can self-assign an open task from this panel
- PM receives a notification when a developer self-assigns a task

---

### Time and Hours Summary

Hub pulls time logs from Zoho Projects.

**Developer prompts:**

```
"How many hours did I log today?"
"Show my hours this week"
```

---

### Notifications and Reminders

Developers receive reminders for:

- Newly assigned tasks or tickets
- Overdue items
- Unfinished work at end of day
