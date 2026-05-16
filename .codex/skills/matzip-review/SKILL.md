---
name: matzip-review
description: Use when the user invokes "/matzip-review" or asks for a matzip product review that automatically chooses the relevant reviewers, such as CEO, designer, marketer, developer, operator, security reviewer, and user, then summarizes the discussion and action items in Notion.
---

# Matzip Review

## Goal

Run a focused product review for the matzip project. The agent should infer which reviewer personas are needed, simulate a useful discussion between them, make decisions explicit, and record the result in Notion.

## Trigger

Use this skill when the user says:

- `/matzip-review`
- `matzip review`
- `맛집/맛잘알 리뷰해줘`
- `CEO, 디자이너, 개발자, 사용자 관점으로 봐줘`
- `토의해서 Notion에 정리해줘`

## Persona Selection

Do not always include every persona. Select only reviewers that materially improve the review.

Default reviewers:

- CEO/founder: product risk, scope, priority, business leverage
- User: core journey, confusion, trust, motivation
- Designer: flow, hierarchy, empty/error states, mobile ergonomics
- Developer: architecture, data flow, tests, rollout risk

Add optional reviewers when relevant:

- Marketing/growth: acquisition, positioning, activation, retention, launch copy
- Operator/moderator: abuse, reports, moderation, seed data, admin workflow
- Security/privacy: auth, RLS, storage, secrets, public data, abuse boundaries
- Data/analytics: metrics, funnels, instrumentation, experiment design
- Support/CS: failure modes, user-facing messages, recovery paths

If the requested change is purely backend/security, skip marketing and visual design unless a user-facing outcome changes. If the requested change is launch/growth, include marketing and analytics.

## Review Flow

1. Resolve context
   - Identify the feature, branch, PR, Notion page, or local diff under review.
   - If a Notion URL is present, fetch it first.
   - If a GitHub PR URL is present, read PR metadata and comments when tools allow.
   - If no explicit artifact exists, inspect local docs and `git diff`.

2. Build reviewer panel
   - List selected personas and one sentence explaining why each is included.
   - Keep the panel small. Usually 3-5 personas is enough.

3. Run discussion
   - Each persona gives the strongest concern and the strongest support.
   - Personas should disagree where useful.
   - Resolve disagreement into a decision, not a vague compromise.

4. Produce decisions
   - Capture decisions as `Decision`, `Why`, `Tradeoff`, and `Owner/Next step`.
   - Mark priority: P0, P1, P2.
   - Separate now/next/later scope.

5. Create Notion record
   - If the user gave a Notion database, create a review page there.
   - If the user gave a Notion page, add a child page or comment that links the review.
   - If a project/task database is available, create follow-up task pages for concrete work.
   - If Notion tools are unavailable, output the Notion-ready markdown and state that it was not created.

6. End with links and verification
   - Include Notion page/task URLs.
   - Include PR/branch/commit URLs when applicable.
   - Include checks run, or state that no code checks were needed for a review-only pass.

## Notion Page Shape

Use this structure for the review page:

```markdown
## Context

- Artifact:
- Branch/PR:
- Review date:

## Selected Reviewers

- CEO/founder:
- User:
- Designer:
- Developer:

## Discussion

### CEO/founder

### User

### Designer

### Developer

## Decisions

- P0:
- P1:
- P2:

## Action Items

- [ ] Task:

## Open Questions

## Summary
```

## Quality Bar

- Make the discussion concrete to the actual app behavior.
- Avoid generic persona theater.
- Tie every action item to a user risk, business risk, or engineering risk.
- Do not create Notion tasks for vague ideas. Convert them into testable outcomes.
