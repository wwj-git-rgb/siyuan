---
name: documentation-update-multilingual
description: Workflow command scaffold for documentation-update-multilingual in siyuan.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /documentation-update-multilingual

Use this workflow when working on **documentation-update-multilingual** in `siyuan`.

## Goal

Updates documentation files across multiple languages for new features or changes.

## Common Files

- `README.md`
- `README.zh-CN.md`
- `README.ja.md`
- `README.tr.md`
- `docs/API.md`
- `docs/API.zh-CN.md`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Edit or add documentation files for each supported language.
- Update main README and related docs.
- Commit all language variants together.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.