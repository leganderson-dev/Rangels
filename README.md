# Rangels

Rangels is a cross-platform personal finance application built with React, TypeScript, Vite, and Supabase. It preserves the proven Finance App workflow while replacing its Electron/Express/SQLite stack with a browser UI connected directly to Supabase.

Current version: **Rangels V0.6.2** (`0.6.2`)

## Prerequisites

- Node.js 20.19+ or 22.12+
- npm

## Run locally

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy the environment template and add your Supabase project values:

   ```sh
   cp .env.example .env.local
   ```

3. Start the development server:

   ```sh
   npm run dev
   ```

Open the local URL shown by Vite.

## Architecture

- React + TypeScript + Vite browser application
- Supabase Auth and Postgres, accessed directly from the browser with row-level security
- No Express server, Electron runtime, or local SQLite database
- Tailwind CSS, Recharts, and Lucide React for the ported interface

## Capabilities

Rangels includes accounts, hierarchical categories, transactions and bulk editing, transfers, scheduled transactions, budgets and budget groups, overview/report/calendar views, JSON backup/restore, and CSV import.

V0.2 adds a merchant-first transaction view, stronger category hierarchy, an actionable Needs category state, a focused transaction toolbar, and a Merchant intelligence tab where historical evidence can be confirmed as reusable classification rules.

The import workflow supports CommBank, NAB, ING, generic four-column bank exports, and Alzex exports. Suggestions learn from previous categorisation, are grouped as Confident (70–100%), Likely (50–70%), and Requires analysis (below 50%), and can be selected in groups or overridden line by line.

## Other commands

- `npm run build` creates a production build.
- `npm run lint` checks the codebase.
- `npm test` runs the parser and matching tests.
- `npm run preview` serves the production build locally.

## Versioning and rollback

Rangels uses Git commits and annotated release tags so every released version has a clear rollback point. See [docs/versioning.md](docs/versioning.md) for the versioning policy and recovery commands.
