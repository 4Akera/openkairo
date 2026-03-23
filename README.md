# OpenKairo

**An open-source electronic health record built around how clinicians actually think — not how software engineers imagine they do.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-ehr--app--five.vercel.app-blue?style=flat-square)](https://ehr-app-five.vercel.app/)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](#license)
[![Built with React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)](https://react.dev)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?style=flat-square&logo=supabase)](https://supabase.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)

---

## The Problem

Every EHR I've used treats a patient encounter like a web form from 2003. You fill in fields, submit, done. The structure is decided for you — and it's usually wrong for what you're actually doing.

A GP seeing a diabetic follow-up doesn't need the same form as a psychiatrist doing an intake, or a surgeon writing a post-op note. But every system forces you into the same shape.

## The Idea

An encounter is a **timeline of typed blocks**. You add what's relevant to this patient, this visit. Nothing more.

- A **Vitals block** has BP, HR, RR, temp, SpO2 — not a text field.
- An **H&P block** has structured ROS checkboxes and PE sections by system.
- A **Plan block** is problem-based with per-problem management entries.
- A **Note block** is freeform prose for anything that doesn't fit a structure.
- **Admin-defined blocks** let your institution define custom types — a psychiatry note looks nothing like a surgical admission.

Every edit creates a **revision**. You always know who changed what and when.

---

## Live Demo

**[https://ehr-app-five.vercel.app/](https://ehr-app-five.vercel.app/)**

| Role | Email | Password |
|------|-------|----------|
| Admin / Clinician | `dr.james@demo.com` | `Demo1234!` |

> Try opening a patient → starting an encounter → adding different block types. Then go to Settings to see the admin panel: block definitions, templates, roles.

---

## Features

### Encounter Timeline
- Encounters are a chronological sequence of blocks, not a fixed form
- Add only the blocks relevant to this visit
- Drag to reorder, pin critical blocks to the top
- Open / close encounters; closed encounters are read-only

### Block System
| Block | What it captures |
|-------|-----------------|
| **Vitals** | BP (with flags), HR, RR, Temp (°C/°F), SpO2, AVPU — auto-flags abnormal values |
| **History & Physical** | Chief complaint, HPI, full ROS by system, Physical exam by system |
| **Plan** | Assessment narrative + per-problem plans + follow-up |
| **Medication Orders** | Ordered items with dose/route/frequency/status |
| **Note** | Freeform clinical note |
| **Custom (admin-defined)** | Any fields your institution needs |

### Block Capabilities (per block type)
- **Versioning** — every save creates a revision; full history is viewable
- **Time series** — repeating data (e.g. hourly vitals) stored as entries
- **Attachments** — image/file uploads linked to a block
- **Acknowledgments** — require sign-off from another clinician
- **Immutability** — lock a block after signing so it can't be edited
- **Co-sign** — require a second clinician to countersign

### Patient Record
- Problem list with onset dates, importance, and status (active/resolved)
- Medication list with dosage, route, frequency, and prescriber
- Allergy list with severity and reaction
- Historical archive: hospitalizations, surgeries, family history, social history, uploaded documents

### Administration
- **Roles & permissions** — create roles with granular permission sets
- **Block definitions** — define custom block types with typed field schemas, conditional logic, and scoring
- **Encounter templates** — pre-built block sets per department or service line
- **Patient field definitions** — extend the patient demographics schema with custom fields
- **User management** — assign roles, manage access

### Access Control
- Per-encounter visibility (staff-wide, restricted to roles, private)
- Per-block visibility overrides
- Patient portal visibility flag per block

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5.9, Vite 8 |
| UI | Tailwind CSS, Radix UI, Lucide icons |
| State | Zustand |
| Forms | React Hook Form + Zod |
| Backend | Supabase (PostgreSQL, Auth, Storage, RLS) |
| Hosting | Vercel |

---

## Getting Started

### Prerequisites
- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)

### 1. Clone and install

```bash
git clone https://github.com/your-username/openkairo.git
cd openkairo
npm install
```

### 2. Set up Supabase

In the [Supabase SQL editor](https://supabase.com/dashboard), run the files in order:

```
supabase/schema.sql          -- creates all tables, RLS policies, functions
supabase/snippets/03_seed_demo.sql   -- optional: loads demo patients and users
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Project Structure

```
src/
├── components/
│   ├── timeline/          # Encounter timeline, block wrapper, block registry
│   │   ├── blocks/        # Built-in block implementations (Vitals, H&P, Plan, ...)
│   │   └── capabilities/  # Shared capabilities (time series, attachments, ...)
│   ├── patient-record/    # Problems, medications, allergies, archive
│   ├── layout/            # App shell, sidebar
│   └── ui/                # Shared UI primitives
├── pages/                 # Route-level page components
├── stores/                # Zustand stores (auth, encounter)
├── types/                 # TypeScript types and domain constants
└── lib/                   # Supabase client, utilities

supabase/
├── schema.sql             # Full database schema with RLS
└── snippets/              # Utility SQL (seed data, wipe scripts)
```

---

## Roadmap

Things I want to build next — good places to contribute:

- [ ] **HL7 FHIR export** — export encounters and patient records as FHIR R4 bundles
- [ ] **Printing / PDF** — clean printable encounter summaries
- [ ] **More built-in block types** — discharge summary, procedure note, referral letter
- [ ] **Patient portal** — read-only view of portal-visible blocks
- [ ] **Audit log UI** — surface the block revision history more prominently
- [ ] **Search** — full-text search across patients and encounter content
- [ ] **Notifications** — alerts for acknowledgment requests and co-sign requests
- [ ] **Real-time collaboration** — live cursor presence when two clinicians edit the same encounter

---

## Contributing

This is early-stage and I'm actively building. All contributions welcome.

**The most useful thing right now:**
1. Try the demo and tell me where the workflow breaks
2. Tell me if this matches how you actually think through a visit — or if it's solving the wrong problem
3. Pick an issue and open a PR

Please open an issue before starting large changes so we can discuss the approach first.

---

## Background

I work in clinical settings. Every EHR I've used is designed around billing workflows and regulatory checkboxes, not clinical thinking. This is an attempt to build something that gets out of the way.

It's not finished. It's not HIPAA-certified. It's not ready for production use with real patients. But the core idea — that an encounter is a flexible timeline of typed blocks — is one I want to see exist properly as open source.

---

## License

MIT
