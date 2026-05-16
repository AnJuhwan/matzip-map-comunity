---
name: pr-review-to-notion
description: Use when turning GitHub PR review comments into code fixes, a PR documentation comment, Notion project/task records, and CEO/design/engineering review summaries. Triggers include "PR 리뷰 정리", "코드리뷰 태스크 생성", "Notion에 PR 연결", "CEO review까지 정리", and "review comments to tasks".
---

# PR Review To Notion

## Goal

Convert PR review feedback into a traceable loop:

1. read the PR review comments
2. classify actionable risks
3. implement verified fixes
4. document what changed and why in the PR
5. create or update linked Notion project/task records
6. capture CEO/design/engineering review notes when requested

## Workflow

### 1. Resolve context

- Identify repository, PR number, local branch, and target Notion page or database.
- If a PR URL is provided, use it directly.
- If a Notion URL is provided, fetch it first and inspect whether it is a page, database, or data source.

### 2. Read review feedback

- Prefer GitHub review threads when available.
- Fall back to merged PR comments when thread state is unavailable.
- Classify findings by priority and behavior area.
- Separate code changes from explanation-only replies.

### 3. Plan and fix

- For bugfixes or risk reductions, write a failing test first when practical.
- Address P0/P1/P2 before cleanup or refactors.
- Keep each fix traceable to a review finding.
- Run the repo's relevant checks before claiming completion.

### 4. PR documentation

Add a concise PR comment or PR body update with:

- review finding addressed
- files changed
- why this result is safer
- tests and build checks run
- remaining follow-up tasks

Do not resolve threads or mark reviews handled unless the user explicitly asks.

### 5. Notion tracking

When a Notion database is available:

- Create one project/page for the PR follow-up.
- Create task records or child task pages for each actionable cluster.
- Store PR URL, branch name, status, priority, validation, and follow-up owner when the schema supports it.
- If the workspace lacks a task database, put a task checklist inside the PR project page and state that limitation.

### 6. Review summaries

When asked for CEO/design/engineering review:

- CEO review: product risk, trust, scope tradeoff, growth implication.
- Design review: user-visible state, clarity, empty/error states.
- Engineering review: data flow, permissions, tests, rollout, operational risk.

Tie each summary back to concrete code or product behavior.

## Output Shape

End with:

- GitHub PR/comment URL if one was created
- Notion page/task URLs if created
- branch/commit info if changes were pushed
- verification commands and pass/fail status
- any work intentionally left open
