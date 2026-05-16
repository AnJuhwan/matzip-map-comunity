---
description: Run a focused matzip product review with only the needed reviewer personas and capture decisions/tasks in Notion.
---

# Matzip Review

Run the repo skill at `.codex/skills/matzip-review/SKILL.md`.

## Preflight

1. Confirm the current workspace is the matzip repository.
2. Inspect the user's prompt for explicit scope:
   - PR URL
   - Notion URL
   - branch or local diff
   - product idea, feature, or bug
3. If no scope is provided, inspect local docs and `git diff` to infer the review target.
4. Check whether Notion tools are available. If not, produce Notion-ready markdown instead of creating a page.

## Plan

1. Select only the reviewer personas needed for this review.
2. Explain why each selected persona is included.
3. Run a short structured discussion.
4. Convert disagreements into decisions and action items.
5. Create or update Notion records when tools and a target database/page are available.

## Commands

Follow the workflow in `.codex/skills/matzip-review/SKILL.md`.

Use these reviewer defaults:

- CEO/founder for product risk and priority.
- User for core journey, trust, motivation, and confusion.
- Designer for flow, hierarchy, empty/error states, and mobile ergonomics.
- Developer for architecture, data flow, tests, rollout, and operational risk.

Add optional reviewers only when relevant:

- Marketing/growth
- Operator/moderator
- Security/privacy
- Data/analytics
- Support/CS

## Verification

For review-only work:

- Verify the Notion page/comment/task URLs were returned if Notion writes were attempted.
- Verify the final summary includes selected reviewers, decisions, action items, open questions, and follow-up owners.

For code-changing work:

- Run the repo's relevant checks before claiming completion.
- Include the command outputs in the final summary.

## Summary

Return:

- selected reviewer panel
- key decisions
- action items by priority
- Notion links
- PR/branch links if relevant
- checks run, or "review-only; no code checks needed"

## Next Steps

Suggest the smallest next action:

- create a PR
- implement the top P0/P1 task
- schedule a follow-up review
- assign Notion tasks
