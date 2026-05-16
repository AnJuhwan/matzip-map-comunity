# Codex Project Instructions

## Compound Engineering Main Loop

For substantial product or engineering changes, use the Compound Engineering
loop by default once the plugin is active:

1. Plan with `/ce-plan` or an existing plan document.
2. Work with `/ce-work`.
3. Review with `/ce-code-review`.
4. Compound learnings with `/ce-compound mode:headless`.

Run browser-level verification before the review/compound closeout when the
change affects user-visible behavior:

```bash
npm run test:e2e
```

Use `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` as the
baseline non-browser gates.

When changing code, follow the lightweight conventions in
`docs/code-conventions.md`.

## GStack Review Routing

GStack is installed globally for Codex in `~/.codex/skills/`. When the user's
request matches a gstack skill, use that skill and follow its own workflow gates.

Use these review modes:

- Product strategy, scope, ambition, or "CEO mode" -> `plan-ceo-review`
- UI/UX plan critique, visual hierarchy, or "designer mode" -> `plan-design-review`
- Architecture, data flow, edge cases, tests, or "developer/engineering mode" -> `plan-eng-review`
- Developer-facing APIs, tooling, onboarding, or DX -> `plan-devex-review`

When the user asks for CEO, designer, and developer review together, run them in
this order unless a newer user message says otherwise:

1. `plan-ceo-review` to challenge the problem, scope, and product direction.
2. `plan-design-review` when the change has UI, UX, or user-visible state.
3. `plan-eng-review` to lock architecture, error paths, tests, rollout, and observability.
4. `plan-devex-review` only when the feature is developer-facing or changes APIs/tools.

Useful adjacent gstack skills:

- `office-hours` before review when the product problem is still unclear.
- `autoplan` for the full CEO/design/engineering review pipeline.
- `review` before landing a diff.
- `qa` or `qa-only` for browser-level behavior checks.
- `design-review` after implementation when rendered UI needs a visual audit.

Do not silently add scope during plan reviews. Present scope changes as explicit
decisions, and keep implementation separate from review unless the user asks to
start building.
