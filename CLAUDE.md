# [PROJECT_NAME]

## Overview
[1-2 sentences describing the project purpose]

## Monorepo Structure
| Path              | Type        | Purpose                     |
| ----------------- | ----------- | --------------------------- |
| `apps/web`        | Next.js App | Main web application        |
| `apps/api`        | FastAPI     | REST API service            |
| `packages/shared` | Library     | Shared types and utilities  |
| `packages/db`     | Library     | Database client and schemas |

## Quick Reference

### Commands by Workspace
```bash
# Root (orchestration)
pnpm dev                    # Start all services
pnpm build                  # Build everything

# Web App (apps/web)
pnpm --filter web dev       # Start web only
pnpm --filter web test      # Test web only

# API (apps/api)  
pnpm --filter api dev       # Start API only
pnpm --filter api test      # Test API only
```

### Environment
- Copy `.env.example` → `.env.local` for local development
- Required vars: `DATABASE_URL`, `API_KEY`

## Progressive Disclosure
Read relevant docs before starting:
- `docs/onboarding.md` — First-time setup
- `docs/architecture.md` — System design decisions
- `docs/[app-name]/README.md` — App-specific details

## Universal Rules
1. Run `pnpm typecheck && pnpm lint && pnpm test` before commits
2. Keep PRs focused on a single concern
3. Update types in `packages/shared` when changing contracts
```

---

## Anti-Patterns to Avoid

### ❌ Don't: Inline Code Style Guidelines
```markdown
<!-- BAD: This bloats context and duplicates linter functionality -->
## Code Style
- Use 2 spaces for indentation
- Always use semicolons
- Prefer const over let
- Use arrow functions for callbacks
- Maximum line length: 100 characters
...
```

### ✅ Do: Reference Tooling
```markdown
## Code Quality
Formatting and linting are handled by automated tools:
- `pnpm lint` — ESLint + Prettier
- `pnpm format` — Auto-fix formatting

Run before committing. Don't manually check style—let tools do it.
```

---

### ❌ Don't: Include Task-Specific Instructions
```markdown

## Database Migrations
When creating a new migration:
1. Run `prisma migrate dev --name descriptive_name`
2. Update the schema in `prisma/schema.prisma`
3. Run `prisma generate` to update the client
4. Add seed data if necessary in `prisma/seed.ts`
...
```

### ✅ Do: Use Progressive Disclosure
```markdown
## Documentation
| Topic                 | Location             |
| --------------------- | -------------------- |
| Database & migrations | `docs/database.md`   |
| API design            | `docs/api.md`        |
| Deployment            | `docs/deployment.md` |

Read relevant docs before starting work on those areas.
```

---

### ❌ Don't: Auto-Generate with /init
The `/init` command produces generic, bloated files.

### ✅ Do: Craft It Manually
Spend time thinking about each line. Ask yourself:
- Is this universally applicable to ALL tasks?
- Can the agent infer this from the codebase itself?
- Would a linter/formatter handle this better?
- Can I point to a doc instead of inlining this?

---

## Optimization Checklist

Before finalizing verify:

- [ ] **Under 100 lines** (ideally under 60)
- [ ] **Every instruction is universally applicable** to all tasks
- [ ] **No code style rules** (use linters/formatters instead)
- [ ] **No task-specific instructions** (use progressive disclosure)
- [ ] **No code snippets** (use `file:line` pointers)
- [ ] **Clear verification commands** that the agent can run
- [ ] **Progressive disclosure table** pointing to detailed docs
- [ ] **Minimal project structure** (just enough to navigate)

