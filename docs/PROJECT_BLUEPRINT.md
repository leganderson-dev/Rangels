# Rangels project blueprint

This document is the source of truth for Rangels. It has higher priority than implementation convenience. If generated code conflicts with these principles, the principles win.

## Background

Rangels began with product brainstorming between Anderson Rangel and ChatGPT before development moved into VS Code with Codex. The repository records the decisions that must survive across tools and future development sessions.

## Purpose

Rangels is private software for managing the Rangel family's financial life. The repository and application are both named **Rangels**.

V1 should quickly answer:

- Where is our money?
- Where did our money go?
- How much can we safely spend?
- How is our cash flow?
- What requires attention?

Other family modules may be considered later. They are not part of V1.

## Product principles

1. **Simplicity wins.** When two solutions work, choose the simpler one.
2. **Every feature earns its place.** Build only solutions to demonstrated problems.
3. **Fast beats clever.** Speed matters more than sophisticated visuals.
4. **Merchant-first.** Merchants retain knowledge; transactions inherit it.
5. **Import-first.** If importing is painful, the product has failed.
6. **Learn continuously.** Each correction should improve later imports.
7. **Low cognitive load.** Avoid unnecessary dialogs, settings, and wizards.
8. **Cross-platform.** Use one codebase for macOS and Windows.
9. **Cloud-first.** Replacing a computer should require little more than logging in.
10. **Private by default.** Nothing is exposed unless intentionally exposed.

## V1 technology

- React
- TypeScript
- Vite
- Supabase PostgreSQL and Auth
- No custom backend server
- GitHub for source control
- Tauri packaging later, after the core workflow works

Do not add enterprise architecture, microservices, event buses, Redis, RabbitMQ, Kubernetes, Docker complexity, CQRS, plugin systems, speculative abstractions, or AI without a demonstrated need.

## Initial concepts

- Account
- Merchant
- Category
- Transaction
- Import

Infrastructure needed to make these concepts secure and reliable is allowed, but must remain minimal.

## Import workflow

```text
Historical export
       ↓
Merchant learning
       ↓
Bank CSV
       ↓
Category suggestions
       ↓
Preview and correction
       ↓
Commit
```

The family uses three banks, each with a different CSV format. Use one small, explicit parser for each confirmed format and normalize all three into the same transaction shape. Do not build a generic import framework before the real formats are available.

Raw financial files must never be committed to Git.

## Merchant learning

Merchant matching should use deterministic normalization, aliases, historical decisions, and fuzzy matching. Return no more than three category suggestions.

Confidence groups are:

- Confident: 70–100%
- Likely: 50–69%
- Requires analysis: below 50% or unmatched

Users can accept the top suggestion for a group, select an individual suggestion, or search the category hierarchy to override it. Manual decisions must not be overwritten by bulk actions and should strengthen future matching after persistence is connected.

AI is not the product. Use it only where it clearly outperforms deterministic logic.

## Categories

Categories are hierarchical. Existing exports encode levels with `:`. Preserve the hierarchy and make restructuring possible; do not couple transaction logic to today's category names.

## UI philosophy

Minimal, quiet, professional, and immediate. Every screen answers one question:

- Import: Can I get my data in?
- Transactions: What happened?
- Merchants: What has Rangels learned?
- Accounts: Where is my money?
- Dashboard: How are we doing?

Do not add charts merely because finance applications usually have charts.

## Performance target

A normal monthly bank statement should take under one minute to import. Over time, only a handful of transactions should require manual categorization.

## Development rules

- Every commit leaves the project working.
- Avoid TODOs, dead code, and speculative architecture.
- Prefer explicit, maintainable code and boring technology.
- Prefer deleting unnecessary code over carrying it.
- Keep schema changes in version-controlled Supabase migrations.
- Tag meaningful releases so code rollback is simple and explicit.
- Inform the product owner before and after every version change.

When unsure, ask: **Does this make Rangels simpler or more complicated?** If it makes V1 more complicated without solving a demonstrated problem, it probably does not belong.
