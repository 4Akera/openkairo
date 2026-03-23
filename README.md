# OpenKairo

**An open-source EHR built around how clinicians actually think — not how software engineers imagine they do.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-ehr--app--five.vercel.app-blue?style=flat-square)](https://ehr-app-five.vercel.app/)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](#license)
[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)](https://react.dev)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?style=flat-square&logo=supabase)](https://supabase.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)

---

Every EHR treats a patient encounter like a web form from 2003. You fill in fields, submit, done. The structure is decided for you — and it's usually wrong for what you're actually doing.

**OpenKairo is different.** An encounter is a timeline of typed blocks. You add what's relevant to this patient, this visit. Nothing more. Hundreds of built-in block types cover every clinical use case — each with the right structure for its purpose, not a generic text field.

Every edit creates a revision. You always know who changed what and when.

---

## Live Demo

**[https://ehr-app-five.vercel.app/](https://ehr-app-five.vercel.app/)**

| Role | Email | Password |
|------|-------|----------|
| Admin / Clinician | `dr.james@demo.com` | `Demo1234!` |

> Open a patient → start an encounter → add blocks. Then check Settings for the admin panel: block definitions, templates, and roles.

---

## Features

- **Timeline-based encounters** — add only the blocks relevant to this visit; pin, reorder, open/close
- **Typed blocks** — every block type has the right fields for its purpose; admins can define custom types
- **Block versioning** — every save is a revision; full edit history always viewable
- **Block capabilities** — time series entries, file attachments, acknowledgments, co-sign, immutable lock
- **Patient record** — problem list, medications, allergies, historical archive with document uploads
- **Roles & permissions** — granular permission sets, per-encounter and per-block visibility controls
- **Encounter templates** — pre-built block sets per department or service line
- **Admin panel** — manage users, roles, block definitions, templates, and patient field schemas

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

## Contributing

Early-stage and actively building. All contributions welcome.

The most useful thing right now:
1. Try the demo and tell me where the workflow breaks
2. Tell me if this matches how you actually think through a visit — or if it's solving the wrong problem
3. Pick an issue and open a PR

Open an issue before starting large changes so we can align first.

---

## License

MIT
