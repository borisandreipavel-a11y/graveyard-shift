# Project Structure

One pnpm workspace holding five parts. The layout below is planned, not built.

```
graveyard-shift/
├── packages/
│   ├── engine/        # Pure game engine; no I/O
│   ├── scenarios/     # YAML scenario files, one per outage
│   ├── language/      # The serverless function talking to the model
│   ├── web/           # React + Vite + Tailwind web app
│   └── mcp/           # MCP server (start, act, read state)
├── infra/             # AWS CDK: S3, CloudFront, Lambda
└── .kiro/             # Committed; never gitignored
```

The engine is the core: the web app and the MCP server both use the same engine, and the engine imports neither.

A separate Kiro Crew app (agents taking scheduled drills) lives in its own repository, not here.

## RULES

**Scenarios are data files with no logic, one file per outage.** Reason: all behaviour stays in the tested engine, and a scenario can be added and validated without touching code.

**Every session is modelled as a shared room from the start**, so a human and an agent can act in the same incident. This shapes the data model only; multiplayer is not being built now. Reason: adding a second participant later would otherwise mean rewriting session state.

## Gitignore hazards

`.kiro/` is committed and must never be gitignored.

The current `.gitignore` ignores `logs`, `*.log`, `*.seed`, `out`, `dist`, and `coverage`. Never use those names for source or scenario content; git would silently skip them.
