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

When creating or updating pull requests, follow `docs/pr-conventions.md`.
PR titles, descriptions, review summaries, and PR comment replies must be
written in Korean.

## Branch And Commit Workflow

Do not implement product or engineering changes directly on `main`. Before
starting implementation, create or switch to a feature branch based on `main`.
Use `codex/<short-task-name>` for Codex-created branches unless the user asks
for a different branch name.

After implementation, split commits by meaningful change boundary. Keep
unrelated edits out of the same commit, and run the relevant verification
commands before committing whenever feasible.

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

## Automatic Planning And Review Before Code

Before writing code for product or engineering work, automatically follow
`docs/agent-planning-review-workflow.md`. The user should not need to ask for
this step explicitly.

At minimum, create or update a planning note that includes:

- the feature or behavior to build,
- the subtasks and completion criteria,
- implementation options considered,
- the selected approach and why it was chosen,
- expected tests, verification, rollout, and rollback notes.

When a Notion planning URL is provided, fetch it first and cite its title and
URL in the planning note. The current project planning source is
`https://www.notion.so/363f1beebaaf804d808de2d9cf668c95`.

When creating or updating a local planning note, also create or update the
corresponding child page under that Notion planning source. Record the feature
plan, reviewer conclusions, and subtasks there as well. Subtasks in Notion must
be checklist items that include the edit area, completion criteria, and
verification method. Add the created Notion page URL back to the local planning
note before asking the user for approval.

Review the plan before implementation with the relevant gstack reviewer lenses:

1. CEO review for product direction, scope, and priority.
2. Designer review for UI, UX, visual hierarchy, empty states, and interaction.
3. Developer review for architecture, data flow, tests, rollout, and failure modes.
4. Security issue review for auth, permissions, RLS, storage, secrets, user input,
   external APIs, privacy, and abuse paths.
5. DX review when the change affects developer-facing APIs, scripts, onboarding,
   docs, or deployment workflows.

Record what each reviewer thought, what they were worried about, what they
recommended, and the final direction chosen after reconciling the reviews.
For trivial documentation or formatting-only changes, use a short in-chat
version of the same checklist and state why a full plan file was unnecessary.

## Automatic Completion Review After Code

After code implementation, automatically follow
`docs/code-completion-review-workflow.md` before reporting the work as complete,
creating a PR, committing, or preparing to deploy.

At minimum, compare the latest user request and plan subtasks against the actual
diff, run the relevant verification commands, check the main behavior manually
when user-visible behavior changed, and call out any missing or unverified tasks.
