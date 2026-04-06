# OpenKairo

> An open-source EHR built around how clinicians actually think 

![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646cff?style=flat-square&logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?style=flat-square&logo=supabase&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white)

Most EHRs force clinicians into a rigid form: fill in the boxes, hit save, move on. The structure is decided upfront and rarely matches what's happening with the patient in front of you.

OpenKairo works differently. Every visit is a **timeline of blocks**. You pick the blocks that matter for this patient, this visit — vitals, medications, a procedure note, a wound photo, a lab result — and each block has the right fields for its purpose. Nothing is buried in a generic text box. The record stays readable, structured, and easy to search long after the visit is over.

## Features

| Feature | Description |
| --- | --- |
| Block-based timeline | Each encounter is a timeline of typed blocks — vitals, meds, notes, labs, and more |
| Structured documentation | Every block has its own fields; no free-text soup |
| Role-based access | Physicians, nurses, lab techs, receptionists, and billing each see only what they need |
| Patient record | Demographics, problem list, results, and reports in one place |

## Demo login

Sign in with **password `Demo123!`** for every demo user. Example:

| Email | Role |
| --- | --- |
| `admin@demo.com` | Admin + physician |
| `dr.emily@demo.com` | Physician (internal medicine) |
| `dr.michael@demo.com` | Physician (general surgery) |
| `nurse.sarah@demo.com` | Nurse |
| `lab.tech@demo.com` | Lab technician |
| `reception@demo.com` | Receptionist |
| `billing@demo.com` | Billing |

Licensed under the [MIT License](LICENSE).
