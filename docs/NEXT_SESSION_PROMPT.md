# Prompt for a fresh Codex session

Start by reading:

- `docs/SESSION_HANDOFF.md`
- `docs/RANGELS_CORE_MODEL.md`
- `docs/RUNNING_BALANCE_DEBUG.md`

Then investigate the 17 Aug 2026 running-balance mismatch.

Do not change data until you can explain why the app is AUD2,330.00 lower than the bank-verified Leg CW balance on 17 Aug 2026.

Known clue:

```text
AUD11,695.87 - AUD250.00 - AUD30.60 = AUD11,415.27
```

So focus on:

- transactions before 17 Aug
- scheduled-generated rows
- transfer sign/account handling
- duplicate/skipped import behavior
- balance anchoring/checkpoints
- inactive account effects

App folder:

`/Users/arangel/Documents/ChatGPT/Rangels/Rangels`

Run:

```bash
npm run dev
```

Local URL:

`http://localhost:5176`
