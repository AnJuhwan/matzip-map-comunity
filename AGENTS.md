# Codex Project Instructions

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
