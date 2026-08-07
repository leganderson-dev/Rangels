# Rangels

Rangels is a cross-platform, merchant-first application built with React, TypeScript, Vite, and Supabase.

Current version: **Rangels V0.1** (`0.1.0`)

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

## Import prototype

The current prototype runs entirely in the browser and does not upload or save financial data.

1. Select the historical finance export to load prior category decisions.
2. Select the supplied four-column bank CSV.
3. Review up to three suggested categories for each transaction.
4. Click a category to confirm it locally.

The other two bank formats will be added when representative exports are available.

## Other commands

- `npm run build` creates a production build.
- `npm run lint` checks the codebase.
- `npm test` runs the parser and matching tests.
- `npm run preview` serves the production build locally.

## Versioning and rollback

Rangels uses Git commits and annotated release tags so every released version has a clear rollback point. See [docs/versioning.md](docs/versioning.md) for the versioning policy and recovery commands.
