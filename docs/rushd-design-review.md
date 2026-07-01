# rushd — Design Review One-Pager

## Problem

Every `rush build` pays a full cold-start cost: parse configs, discover projects, resolve dependencies, build the operation graph — then throws it all away. The next `rush build` repeats everything. In large monorepos (100+ projects), this overhead adds up to seconds per invocation and minutes per developer per day.

```
 rush build (1st)        rush build (2nd)        rush build (Nth)
 ┌────────────────┐      ┌────────────────┐      ┌────────────────┐
 │ Parse configs   │      │ Parse configs   │      │ Parse configs   │
 │ Discover projs  │      │ Discover projs  │      │ Discover projs  │
 │ Resolve deps    │      │ Resolve deps    │      │ Resolve deps    │
 │ Build graph     │      │ Build graph     │      │ Build graph     │
 │ Execute         │      │ Execute         │      │ Execute         │
 │ Discard state   │      │ Discard state   │      │ Discard state   │
 └────────────────┘      └────────────────┘      └────────────────┘
     all repeated             all repeated            all repeated
```

## Proposal: rushd (Rush Daemon)

A persistent background process that starts once, keeps state in memory, and serves build/test requests from any client — CLI, IDE, or AI tool.

```
 rushd (starts once, stays alive)
 ┌─────────────────────────────────────────┐
 │ Parse configs ✓  (once)                 │
 │ Discover projects ✓  (once)             │
 │ Resolve dependencies ✓  (once)          │
 │ Build operation graph ✓  (once)         │
 │                                         │
 │ Listening for requests...               │
 │                                         │
 │  rush build → 15ms connect → execute    │
 │  rush build → 15ms connect → skip (cached) │
 │  rush test  → 15ms connect → execute    │
 │  VS Code    → 15ms connect → execute    │
 └─────────────────────────────────────────┘

 Startup cost: ~15ms (pipe connect) vs ~500ms-3s (cold start)
```

**Prior art:** Docker (`dockerd`), Gradle daemon, TypeScript `--build --watch`.

## What Changes for Users

| Today | With rushd |
|-------|-----------|
| Every `rush build` cold-starts | First `rush build` auto-starts daemon; subsequent builds connect in ~15ms |
| No state between invocations | Daemon remembers what succeeded, only re-runs what changed |
| Single terminal per build | Multiple terminals, IDEs, and AI tools share one daemon |
| Watch mode is separate | Daemon subsumes watch mode — always on, always ready |

Users don't need to learn new commands. `rush build` auto-starts the daemon if it's not running. Power users get `rushd start/stop/status` for explicit control.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                          rushd daemon                           │
│                                                                 │
│  ┌────────────┐   ┌────────────────┐   ┌────────────────────┐ │
│  │ IPC Server │   │ Request Router │   │ Execution Engine   │ │
│  │ (Named     │──>│                │──>│ (OperationGraph)   │ │
│  │  Pipe /    │   │ build / test / │   │                    │ │
│  │  Unix      │   │ cancel / status│   │ Stateful, persists │ │
│  │  Socket)   │   │ / shutdown     │   │ across iterations  │ │
│  └────────────┘   └────────────────┘   └────────────────────┘ │
│        ▲                                        │              │
│        │              ┌──────────────────┐      │              │
│        │              │ State Manager    │◄─────┘              │
│        │              │ - Loaded configs │                     │
│        │              │ - Operation graph│                     │
│        │              │ - Previous results│                    │
│        │              │ - Client sessions│                     │
│        │              └──────────────────┘                     │
└────────┼───────────────────────────────────────────────────────┘
         │
         │  Named pipe (Win) / Unix socket (macOS/Linux)
         │
    ┌────┴──────────────────────────────────────────┐
    │               Clients (agents)                 │
    │                                                │
    │  ┌──────────┐  ┌──────────┐  ┌──────────────┐│
    │  │ rush CLI │  │ VS Code  │  │ AI / MCP     ││
    │  │ (auto-   │  │ extension│  │ tools        ││
    │  │  detects │  │          │  │              ││
    │  │  daemon) │  │          │  │              ││
    │  └──────────┘  └──────────┘  └──────────────┘│
    └───────────────────────────────────────────────┘
```

## Dependency: PR #5378 (Stateful OperationGraph)

**PR:** https://github.com/microsoft/rushstack/pull/5378 — approved, 80 files, +7477/-4804 lines.

Rush's current execution engine is disposable — built fresh and discarded every run. PR #5378 makes it **stateful**: the `OperationGraph` is created once and reused across iterations.

| Without PR #5378 | With PR #5378 |
|---|---|
| Daemon saves config parsing (~500ms) | Daemon saves config parsing + graph building + incremental execution |
| Graph still rebuilt per request | Graph persists — only changed operations re-execute |
| Good improvement | Full improvement |

The daemon is useful without the PR (saves cold-start), but the PR unlocks the full value (incremental execution).

**Key APIs from PR #5378 the daemon uses:**

| API | Daemon use case |
|-----|----------------|
| `OperationGraph` (persistent) | Created once at daemon startup, reused for all requests |
| `scheduleIterationAsync()` | Client sends "build" → daemon queues an iteration |
| `invalidateOperations()` | Files changed → mark affected operations dirty |
| `setEnabledStates()` | Client asks for specific project → enable only that subtree |
| `abortCurrentIterationAsync()` | Client cancels → stop current iteration |
| `hooks.onExecutionStatesUpdated` | Stream operation progress back to client |
| `hooks.onIdle` | Signal daemon is ready for next request |

## Design Decisions

### 1. App Structure & Startup

**Recommended: C (standalone app, auto-start + manual control)**

| Option | Description | Trade-off |
|--------|-------------|-----------|
| A: Standalone, manual start | User runs `rushd start` explicitly | Predictable, but extra step to remember |
| **C: Standalone, auto-start + manual** | `rush build` auto-starts daemon; `rushd start/stop/status` available | Seamless default + explicit control for debugging |
| D: Subcommand in rush CLI | `rush daemon start/stop` | Simpler discovery, but couples daemon to CLI |

Auto-start means users get the benefit without learning anything new. Manual commands exist for ops/debugging. This is how Gradle works — no one types "start the daemon."

### 2. IPC Transport

**Recommended: A (named pipes / Unix sockets)**

| Option | Description | Trade-off |
|--------|-------------|-----------|
| **A: Named pipes / Unix sockets** | OS-level private channel | Fastest, no port conflicts. Industry standard (Docker, PostgreSQL, Gradle) |
| B: TCP localhost | Network connection on 127.0.0.1 | Easier to debug, but port conflicts and overhead |
| C: Node.js IPC | Built-in parent-child channel | Only parent can talk to child — each terminal spawns its own daemon, defeating the purpose |

Node.js `net` module uses the same API for both platforms. The only difference is the path format:
- Windows: `\\.\pipe\rushd-<workspace-hash>`
- macOS/Linux: `/tmp/rushd-<workspace-hash>.sock`

## Agent Protocol

Newline-delimited JSON (NDJSON) over the named pipe. Each message is one JSON object followed by `\n`.

**Client → Daemon:**

| Message | Purpose |
|---------|---------|
| `ping` | Health check |
| `build { projects?, phases?, parameters? }` | Request a build |
| `cancel` | Abort current execution |
| `status` | Query daemon state |
| `shutdown` | Graceful shutdown |

**Daemon → Client:**

| Message | Purpose |
|---------|---------|
| `pong { uptime, activeClients, protocolVersion }` | Health response |
| `operationStatus { operation, status }` | Streamed per-operation progress |
| `output { operation, text, stream }` | Streamed terminal output |
| `result { status, duration, operations }` | Final build result |
| `error { code, message }` | Error response |
| `daemonStatus { state, uptime, activeClients }` | Status response |

## Multi-Client Behavior

When multiple clients send requests simultaneously:

- **v1 (Queue):** Requests execute sequentially. Second client waits for first to finish.
- **v2 (Merge):** Requests merged into a single iteration using `setEnabledStates()`. Both clients get streamed results from the same execution.

Client disconnect mid-build: abort if no other client cares, continue if others are watching.

## Lifecycle

```
Auto-start flow:

  rush build
    └── Daemon running? ──Yes──► Connect (15ms) → send request → stream results
    └── No ──► Start daemon in background
              └── Wait for ready signal
              └── Connect → send request → stream results

  Daemon auto-shuts down after 30 min idle (configurable).
  Next rush build auto-starts it again.
```

## Package Structure

```
apps/rushd/                      # Standalone app (like rush-mcp-server)
├── bin/rushd                    # CLI entry point
├── src/
│   ├── start.ts                 # CLI: rushd start/stop/status
│   ├── startDaemon.ts           # Forked background process entry
│   ├── RushdDaemon.ts           # Server: named pipe, message routing, lifecycle
│   ├── RushdClient.ts           # Client: connect, send, stream responses
│   ├── RushdProtocol.ts         # Message types, NDJSON serialization
│   ├── RushdLifecycle.ts        # PID files, pipe paths, stale socket cleanup
│   └── index.ts                 # Public API exports
├── package.json
└── config/rig.json
```

Estimated size: ~1,000-1,500 lines of source. Comparable to `rush-mcp-server` (1,110 lines).

## Open Questions

1. **Idle timeout default** — 30 minutes? Configurable via `rush.json`?
2. **Version mismatch** — When daemon version doesn't match CLI, auto-restart or error?
3. **Config file changes** — Should the daemon watch `rush.json` and restart itself if config changes?
4. **CI environments** — Should daemon auto-start be disabled in CI? (Likely yes — CI builds are one-shot.)
5. **Logging** — Where do daemon logs go? `~/.rushd/<hash>/daemon.log`?
