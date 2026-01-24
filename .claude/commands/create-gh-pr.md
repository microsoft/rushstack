---
description: Commit unstaged changes, push changes, submit a pull request.
model: opus
allowed-tools: Bash(git:*), Bash(gh:*), Glob, Grep, NotebookRead, Read, SlashCommand
argument-hint: [code-path]
---

# Create Pull Request Command

Commit changes using the `/commit` command, push all changes, and submit a pull request.

## Behavior
- Creates logical commits for unstaged changes
- Pushes branch to remote
- Creates pull request with proper name and description of the changes in the PR body