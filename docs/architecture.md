# Rangels architecture

Rangels is a browser application with no custom backend server.

```text
React + TypeScript + Vite
          |
          | Supabase client (authenticated user)
          v
Supabase Auth + Postgres + row-level security
```

The user interface and finance workflows are ported from `leganderson-dev/finance-app`. Express, Electron, SQLite, Multer, filesystem database backups, and desktop IPC are intentionally excluded. Their responsibilities are handled by the browser, Supabase, and portable JSON backups.

The import layer is merchant-first. It normalises bank descriptions, compares them with previously categorised transactions, assigns confidence scores, and keeps every suggestion reviewable and overridable before persistence.
