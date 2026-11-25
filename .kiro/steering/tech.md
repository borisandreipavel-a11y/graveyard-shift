# Tech Stack

Everything is planned; nothing is built yet.

## Language and workspace

- TypeScript everywhere, strict mode.
- pnpm workspace.

## Parts

| Part | Notes |
|---|---|
| Engine | Pure functions, no I/O. |
| Scenarios | YAML files validated by a Zod schema. |
| Web app | React, Vite, Tailwind. The terminal is our own component, not a terminal-emulator library. |
| MCP server | Official TypeScript SDK, imports the engine directly. |
| Language layer | One small serverless function that calls a small, fast model. Amazon Bedrock if available, otherwise another provider behind the same function. |
| Infrastructure | Static site on S3 and CloudFront, one Lambda function, all defined in AWS CDK. |

## Testing

- Vitest for unit tests.
- fast-check for property-based tests.
- Playwright for the web app.
- CI: GitHub Actions, including scenario playthroughs run with the Kiro CLI.

## RULES

**The engine decides what happens.** The LLM only turns typed text into one allowed action and words the reply; it never changes game state. Reason: outcomes must be testable, not made up by a model.

**Same inputs give the same outcome.** The engine reads no real clock and has no hidden randomness. Reason: property tests, repeatable CI playthroughs, and fair comparison between players all require determinism.

**The game works with the LLM switched off**, falling back to simple typed commands. Reason: tests, CI, and players must not depend on a model call.

## Open questions

- LLM provider and model are undecided.
