# rushd — Background Daemon Design Document

## Problem Statement

Every `rush build` today starts from scratch — parses all configs, builds the dependency graph, executes operations, then throws everything away. The next `rush build` repeats all that work even if nothing changed.

```
Today (without daemon):

  rush build (1st)          rush build (2nd)          rush build (3rd)
  ┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
  │ Parse configs     │      │ Parse configs     │      │ Parse configs     │
  │ Build graph       │      │ Build graph       │      │ Build graph       │
  │ Execute           │      │ Execute           │      │ Execute           │
  │ Throw away        │      │ Throw away        │      │ Throw away        │
  └──────────────────┘      └──────────────────┘      └──────────────────┘
      ^^^^^^^^^^^^               ^^^^^^^^^^^^               ^^^^^^^^^^^^
      repeated work              repeated work              repeated work
```

## What is rushd

`rushd` is a background daemon that starts once and stays alive. It loads configs once, builds the operation graph once, and accepts commands from any terminal, IDE, or AI tool.

```
With daemon:

  rushd start (once)
  ┌────────────────────────────────┐
  │ Parse configs (once)           │
  │ Build graph (once)             │
  │                                │
  │ Waiting for commands...        │◄── rush build  → "build please"  → results
  │                                │◄── rush build  → "nothing changed, skip"
  │                                │◄── rush test   → "test please"   → results
  │                                │◄── VS Code     → "build my-app"  → results
  │                                │
  │ Still alive, state is hot...   │
  └────────────────────────────────┘
```

Similar to Docker (`docker` CLI + `dockerd` daemon) and Gradle (`gradle --daemon`).

---

## Why PR #5378 is Required

**PR:** https://github.com/microsoft/rushstack/pull/5378

Rush's execution engine is currently **disposable** — designed to run once and be thrown away. You cannot build a daemon on top of a disposable engine.

PR #5378 introduces a **stateful `OperationGraph`** that persists across multiple executions:

| Before PR #5378 (disposable) | After PR #5378 (stateful) |
|------|-------|
| Graph rebuilt every `rush build` | Graph built once, reused |
| No memory of previous runs | Knows what succeeded/failed last time |
| Can't change what's enabled mid-session | `setEnabledStates()` enables/disables dynamically |
| Watch mode = teardown and rebuild each cycle | Watch mode = same graph, only re-run what changed |

Key APIs the daemon would use:

| API | Purpose |
|-----|---------|
| `OperationGraph` | Persistent graph — the daemon's brain |
| `scheduleIterationAsync()` | Queue work when a client requests a build |
| `invalidateOperations()` | Mark operations dirty when files change |
| `setEnabledStates()` | Enable only the projects a client asked for |
| `abortCurrentIterationAsync()` | Cancel on client request |
| `hooks.onIdle` | Know when the daemon is free |
| `hooks.onExecutionStatesUpdated` | Stream status updates to clients |

Without PR #5378, the daemon would still rebuild the graph internally on every request — defeating the purpose.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                       rushd (daemon)                      │
│                                                           │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────┐ │
│  │ IPC      │   │ Request      │   │ Execution Engine │ │
│  │ Server   │──>│ Router       │──>│ (OperationGraph  │ │
│  │ (Named   │   │              │   │  from PR #5378)  │ │
│  │  Pipe)   │   │ build/test/  │   │                  │ │
│  │          │   │ cancel/status│   │                  │ │
│  └──────────┘   └──────────────┘   └──────────────────┘ │
│       ▲                                                   │
└───────┼───────────────────────────────────────────────────┘
        │  Named pipe / Unix domain socket
        │
   ┌────┴────────────────────────────────────┐
   │            Clients (agents)              │
   │  ┌──────────┐  ┌───────┐  ┌───────────┐│
   │  │ rush CLI │  │VS Code│  │ AI / MCP  ││
   │  └──────────┘  └───────┘  └───────────┘│
   └─────────────────────────────────────────┘
```

---

## Design Decisions

### 1. App Structure & Startup

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A: Standalone app, manual start** | Separate `apps/rushd/` binary. User runs `rushd start` explicitly. Like Docker on Linux (`dockerd`). | Clean separation, own crash boundary, predictable, no magic | Users must remember to start daemon, learn a second command |
| **B: Standalone app, auto-start** | Separate `apps/rushd/` binary. `rush build` detects no daemon, starts one automatically in background. Like Gradle. | Clean separation + seamless — users get the benefit without thinking about it | First build slightly slower (daemon startup), implicit behavior may surprise |
| **C: Standalone app, auto-start + manual control** | Same as B, but `rushd start/stop/status` still available for power users. Like Gradle with explicit daemon commands. | Best of both worlds — seamless default, explicit control when needed | Slightly more code to handle both paths |
| **D: Subcommand, manual start** | No separate binary. `rush daemon start/stop/status` inside existing CLI. | Single entry point, simpler discovery | Daemon code loaded for all commands, tighter coupling, crash boundary shared |

### 2. IPC Transport

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A: Named pipes / Unix sockets** | Private OS-level channel (`\\.\pipe\rushd-<hash>` on Windows, `/tmp/rushd-<hash>.sock` on Mac/Linux) | No port conflicts, fastest, industry standard (Docker, PostgreSQL, Gradle) | Stale socket cleanup needed on Mac/Linux |
| **B: TCP localhost** | Network connection on 127.0.0.1:PORT | Easy to debug with standard tools, simple cross-platform | Port conflicts, unnecessary network overhead |
| **C: Node.js IPC** | Built-in parent-child channel | Zero setup, already used in codebase | Only parent can talk to child — multiple terminals each spawn their own daemon, defeating the purpose |

---

## Daemon Lifecycle Flow

### Startup
```
rushd start
  └── Check PID file → daemon already running? → exit with message
  └── Fork detached background process
  └── Load rush.json and all config
  └── Create IPC server (named pipe)
  └── Write PID file
  └── Start idle timer
  └── Waiting for connections...
```

### Client Connection
```
rush build my-app
  └── Read PID file → daemon exists?
  └── Connect to named pipe → success? → delegate to daemon
                             → failure? → fall back to normal rush build
  └── Send build request
  └── Receive streamed status updates and output
  └── Receive final result
  └── Disconnect
```

### Shutdown
```
rushd stop
  └── Connect to daemon → send shutdown
  └── Daemon: stop accepting connections
  └── Wait for in-flight operations (with timeout)
  └── Close all clients, clean up PID/socket files
  └── Exit
```

### Auto-shutdown
```
No clients connected + no operations running for N minutes
  └── Same shutdown sequence
  └── Log: "Auto-shutdown due to idle timeout"
```

---

## Multi-Client Behavior

```
Terminal A: rush build my-app ──►┌──────────┐
Terminal B: rush build my-lib ──►│  rushd    │

  v1 (Queue):    Run A's build first, then B's
  v2 (Merge):    Combine into single iteration (requires PR #5378's setEnabledStates)
```

If a client disconnects mid-build: abort if no other client cares, continue if others are watching.

---

