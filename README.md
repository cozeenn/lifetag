# LifeTag Multi-Profile Emergency Information System

## New Structure

- `index.html` – landing page and total profile count
- `add-profile.html` – dedicated page for adding and editing profiles
- `profiles.html` – searchable directory of all saved profiles
- `profile.html` – complete profile details
- `emergency.html` – emergency view for a selected person
- `settings.html` – export, import, theme, and delete-all controls
- `app.js` – multi-profile storage, search, editing, and display logic
- `qr.js` – profile-specific QR code generation
- `style.css` – shared responsive design
- `assets/` – logo and project assets

## How It Works

Each person is saved as a separate object inside a Local Storage array. Every profile receives a unique ID. The search page filters names, contacts, locations, blood types, and medical conditions.

## Care Hub Features

- Emergency-readiness score based on critical profile fields
- Annual medical-review reminders and dashboard status counts
- Advanced search, blood-type/readiness filters, and flexible sorting
- Secondary contacts, physician, hospital, insurance, language, accessibility, donor, and address fields
- One-tap emergency calling, maps, printable responder view, QR access, and copyable response summary
- JSON backup/restore, dark mode, and backward compatibility with older saved profiles
- Medication schedules, refill dates, appointment planning, and calendar export
- Local health-document vault and chronological medical timeline
- Vital-sign history with basic attention flags
- Condition-specific emergency action plans surfaced in Emergency Mode
- Caregiver permission records, expiring-link prototypes, and offline PWA caching

LifeTag is an organizational aid, not a substitute for professional medical advice or an official medical record. Verify important information regularly and protect exported backups because they contain sensitive personal data.

## Supabase Cloud Setup

1. Create a Supabase project and run `supabase-schema.sql` in its SQL Editor.
2. Serve LifeTag through localhost or HTTPS and open `auth.html`.
3. Enter the project URL and anonymous public key. Never use the service-role key in the browser.
4. Create an account, confirm the email, and sign in. Existing offline records will synchronize automatically.

Supabase supplies authenticated sessions, PostgreSQL row-level security, private document storage, cross-device synchronization, audit records, caregiver roles, revocable-share infrastructure, and scheduled notification jobs. Production deployments should additionally configure SMTP, MFA policy, Edge Functions for notification delivery and share redemption, backups, monitoring, and the appropriate legal/privacy review.

Deploy the included `dispatch-notifications` and `redeem-share` Edge Functions with the Supabase CLI. Configure `CRON_SECRET`, schedule the dispatcher with Supabase Cron, and connect an approved email, SMS, or push provider before enabling patient notifications.

## Running the Project

Open the folder in Visual Studio Code and run `index.html` with Live Server.

## Important Limitation

Because this version uses Local Storage, the profiles are available only in the same browser and device. For shared access across computers or phones, the next version would require a backend and database such as PHP and MySQL, Firebase, or Supabase.
