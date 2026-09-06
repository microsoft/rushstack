# @rushstack/rush-cli-client

Separate `rush-client` and `rushx-client` binaries, opt-in until cutover. Existing
`rush`, `rushx`, and their reporter entrypoints are unchanged.

Routing precedence:

1. `--no-daemon` before `--`, help, and never-daemonize commands stay in-process.
2. CI stays in-process unless `RUSH_DAEMON=1` explicitly opts in, even if config enables the daemon.
3. `RUSH_DAEMON` overrides `rush.json`'s `daemon.enabled`; the default is false.
4. Auto-start is considered only after selecting daemon execution.

`install`, `update`, package mutation, publishing, setup, management, and other
administrative commands never run through this initial client. Rushx script names
are not interpreted as Rush built-ins. Arguments after `--` are preserved.
Request cwd, environment, argv, width and color are captured before connecting.
The protocol currently expresses request color as a boolean; subscriptions carry
the corresponding color level. There is no SIGWINCH forwarding.

The current standalone host rejects execution as typed `unsupported` because it
has no request resolver or warm graph. That rejection and a controlling-terminal
requirement fall back in-process. Unknown rejections, transport loss after sending
a request, and output failures do not replay the command.

Piped input stays in-process: the protocol has neither stdin EOF nor normal input
admission, and consuming input before fallback would corrupt the invocation.
The existing Rush entrypoints resolve project scripts from cwd. Fallback loads the
existing `@microsoft/rush` version-selecting entrypoint in the client process,
preserving its startup checks, output and reporter integration instead of
inventing a cached module path. A different selected Rush version has no daemon launcher integration
yet. Older Rush versions may also reject the new `daemon` config block; use
environment-only opt-in until a supporting Rush release is selected.

## Configuration

Every setting uses **environment > config > default**. Boolean overrides accept
only `0`/`1`; numeric overrides accept finite unsigned decimal numbers. Unknown
keys and unknown `RUSH_DAEMON*` variables fail validation.

| `daemon` key | Environment override | Default | Runtime status |
| --- | --- | --- | --- |
| `enabled` | `RUSH_DAEMON` | false | Client routing |
| `autoStart` | `RUSH_DAEMON_AUTO_START` | true | Only after opt-in |
| `idleTimeoutSeconds` | `RUSH_DAEMON_IDLE_TIMEOUT_SECONDS` | 900 | Requires WS3 host idle-timeout integration |
| `queueTimeoutSeconds` | `RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS` | 30 | Sent through existing admission contract |
| `watch` | `RUSH_DAEMON_WATCH` | false | Validated, inactive integration seam |
| `warmIdleTimeoutSeconds` | `RUSH_DAEMON_WARM_IDLE_TIMEOUT_SECONDS` | 300 | Validated, inactive integration seam |
| `warmMemoryBudgetMB` | `RUSH_DAEMON_WARM_MEMORY_BUDGET_MB` | 512 | Validated, inactive integration seam |
| `warmSetMaxProjects` | `RUSH_DAEMON_WARM_SET_MAX_PROJECTS` | 20 | Validated, inactive integration seam |
| `autoWarmByTelemetry` | `RUSH_DAEMON_AUTO_WARM_BY_TELEMETRY` | false | Validated, inactive integration seam |

Timeouts must be positive and at most 2147483.647 seconds; queue timeout additionally
accepts zero and is rounded down to milliseconds. Memory budget must be positive
and no larger than JavaScript's maximum safe integer. Project count must be a
positive safe integer. No warm-set setting changes build correctness.

`daemon start|stop|restart|status|logs` and
`daemon graph show|status|scope-in|scope-out|invalidate|watch|pause|resume` require
host lifecycle/graph protocol integration and currently fail explicitly. Setting
`RUSH_DAEMON_EXPERIMENTAL=1` does not make absent graph contracts available.
These are outstanding acceptance criteria, not simulated management commands.
