# Rangels vision

Rangels is a cross-platform application for macOS and Windows.

## Project principles

- Keep it extremely simple.
- Build cross-platform for macOS and Windows.
- Use React, TypeScript, and Vite.
- Use Supabase as the backend.
- Do not add a backend server for V1.
- Design merchant-first.
- Make importing the primary workflow.
- Avoid unnecessary abstractions.
- Every feature must earn its place.

## Bank imports

The family uses three banks. Each bank has its own CSV export format, and Rangels must support all three.

Each confirmed bank format should have a small, explicit parser. The parsers should normalize their records into the same internal transaction shape. Do not assume one universal CSV layout, and do not build a generic import framework before the three real formats are available.

Raw financial exports must not be committed to the repository.
