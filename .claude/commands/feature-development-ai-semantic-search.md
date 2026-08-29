---
name: feature-development-ai-semantic-search
description: Workflow command scaffold for feature-development-ai-semantic-search in siyuan.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /feature-development-ai-semantic-search

Use this workflow when working on **feature-development-ai-semantic-search** in `siyuan`.

## Goal

Implements a new AI-based semantic search feature, including backend logic, API, UI config, and localization.

## Common Files

- `kernel/model/embedding.go`
- `kernel/api/ai.go`
- `kernel/api/router.go`
- `kernel/task/queue.go`
- `app/src/config/tabs/aiTab.ts`
- `app/src/config/tabs/aiUi.ts`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Implement backend logic (Go) for embeddings and AI search.
- Update or create API endpoints for AI features.
- Add or update UI config files for AI tabs.
- Update localization files for new UI elements.
- Modify or add SCSS for related UI components.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.