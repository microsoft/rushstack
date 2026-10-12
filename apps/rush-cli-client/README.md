# @rushstack/rush-cli-client

Separate `rush-client` and `rushx-client` binaries, opt-in until cutover. Existing
`rush`, `rushx`, and their reporter entrypoints are unchanged.

To try the daemon on the rushstack repository itself before a release contains it, follow the
[contributor dogfooding guide](../../docs/rush/dogfooding-rush-daemon.md).

## Native frontend dependency

The dependency on `@microsoft/rush` is intentional: it is the version-selecting
frontend, whereas `@microsoft/rush-lib` is the execution engine. Native routing
and safe daemon fallback in `src/launchClient.ts` restore the `rush` or `rushx`
executable name and load the frontend's exported `lib/start` entrypoint. They
must not call the client's bundled `Rush.launch()` or `Rush.launchRushX()`
directly: the workspace or `RUSH_PREVIEW_VERSION` can select a different engine.
The client also reuses the frontend's `MinimalRushConfiguration` for native
Rushx discovery output instead of maintaining a second implementation.

The startup sequence in `apps/rush/src/start.ts` and `RushFrontend.ts` selects
and initializes the reporter before `RushVersionSelector` installs or loads
the selected engine. `RushCommandSelector` then handles engine capabilities
and old-engine output compatibility. Selection supports releases predating
`rush-lib` (before Rush 4), and cannot depend on a new API being present in the
selected engine. Calling a selector alone would also bypass reporter startup,
preview-version validation, and native launch options.

The runtime dependency direction is client → frontend → engine; `rush-lib`
does not depend on this client or on the frontend. Re-exporting the existing
frontend selector from `rush-lib` would introduce an engine → frontend → engine
cycle. A future standalone bootstrap package would need to own the complete
startup/reporting contract, not just engine installation. Until that separation
is warranted, reusing the existing frontend preserves version selection and
reporter behavior without duplicating or relocating bootstrap code.

## Routing

Routing precedence:

1. `--no-daemon` before `--`, help, never-daemonize commands, an option before the command other than
   `--quiet`/`-q` (such as `--debug`), and Rushx with any TTY stdio stay in-process. `--quiet` and `-q` only hide
   native Rush's startup banner, which a daemon request never prints, so `rush -q build` is sent to the daemon
   without them.
2. CI stays in-process unless `RUSH_DAEMON=1` explicitly opts in, even if config enables the daemon.
3. `RUSH_DAEMON` overrides `rush.json`'s `daemon.enabled`; the default is false.
4. Auto-start is considered only after selecting daemon execution.

A command that routing keeps in-process shows no progress line. It says why in one stderr line before native
Rush starts, in agent mode (see [Output modes](#output-modes)) and, in legacy mode, when `RUSH_DAEMON=1` asked
for the daemon. Rushx uses the `rushx-client:` prefix. `--no-daemon` and help print nothing. The lines are:

- `rush-client: RUSH_LOG_LEVEL selects the native reporter; using in-process Rush.` The same line names
  `RUSH_REPORTER=<value>`, `--reporter`, `--output`, `--log-level` or `useRushReporter in experiments.json`
  (see below).
- `rush-client: the daemon does not support "--debug"; using in-process Rush.`
- `rush-client: the daemon does not run "check"; using in-process Rush.`
- `rushx-client: the daemon does not run scripts in a terminal; using in-process Rush.`
- `rush-client: RUSH_DAEMON=0 turns the daemon off; using in-process Rush.`
- `rush-client: the daemon is not enabled for this repo; using in-process Rush.` To enable it, set `daemon.enabled`
  to `true` in `rush.json`, or set `RUSH_DAEMON=1` in the environment.
- `rush-client: CI is set, so the daemon is off unless RUSH_DAEMON=1; using in-process Rush.` The line names
  the first CI marker that is set: `CI`, `TF_BUILD`, `GITHUB_ACTIONS`, `JENKINS_URL` or `TEAMCITY_VERSION`.

When the selected daemon cannot be reached or started, an ordinary invocation prints the reason and runs
in-process (`rush-client: <reason>; using in-process Rush.`). A startup failure while a live process can
still make the daemon ready is the exception: a process that listens at the endpoint but does not
complete hello/ping in time, a startup helper that still waits for its daemon, or another client that
holds the start mutex, as in a burst of clients that all find no daemon. In-process Rush would take the
repository lock, and the requests that the daemon serves would then wait for it, or fail when their wait
timeout ends (see below). Instead, the client keeps trying for one more startup deadline
(15 seconds, so about 30 seconds in all) and uses the daemon once it is ready. It says so when it starts
waiting (`rush-client: The daemon is not ready yet. <live process>, so this command waits up to 15 s more
for it instead of running Rush in-process.`; agent output shows "rushd is still starting; waiting for it"
as the progress phase, and on a pipe writes it as a progress line that ends with `because <live process>`). If the daemon is still not ready, the command exits with code 1. The message
gives the startup error with its `--no-daemon` hint, then the process that is still live, "so Rush was
not run in-process", and a pointer to `rush-client daemon status`. When the process that the daemon's
ownership record names still runs but does not answer (on Linux, for example because a signal stopped
it), the message instead says what that process is doing, then on a line of its own that Rush was not
run in-process, and its last line says what to do, for example `Resume it with "kill -CONT <pid>"; it
then serves the next command.` On Linux, when that process has this workspace's ownership record open, as the daemon that
wrote it does, and stays stopped (state T or t) while the client samples it for 1.5 s, the command does
not wait for either deadline: it exits with code 1 and that message once the 1.5 s have passed. It names
a signal to send only to a Rush daemon that has that record open; for any other process it says to end
that process if it is this workspace's daemon, and else to delete the ownership record, and that until
then each command that uses the daemon first waits 15 s for a daemon to answer. Such a Rush
daemon that still runs after its socket file was deleted also fails the command this way, with code 1
and without running Rush in-process, once the client has waited 15 seconds for it to exit; its last line
says that it may exit once its running requests finish. When the process that the ownership record names
has exited but is not reaped yet (on Linux, state Z), nothing live can make the daemon ready, so the
command runs Rush in-process once its startup deadline (15 s) has passed. The last line of its message
names the parent that has not reaped that process, and says that until then each command that uses the
daemon first waits 15 s for a daemon to answer.

When the client runs Rush in-process after it tried the daemon, because it could not reach one or because the
daemon handed the request back, and another Rush process holds the repository's lock, such as the daemon while it
builds for another request, Rush waits for the lock instead of failing at once with "Another Rush command is
already running in this repository." It waits only for what is left of the request's wait timeout (see below),
counted from when the client sent the request, or from when it gave up on the daemon if it could not reach one;
the built-in 30-second default applies. It writes one stderr line when it starts to wait (`Waiting up to 28 s for
the Rush daemon (PID 4242) to release this repository's lock.`). If the lock is still held at the deadline, the
command fails as before, and the error names the holder (`The Rush daemon (PID 4242) still holds this repository's
lock.`). With `--no-wait` or a zero timeout, Rush tries once and names the holder. On Windows the lock file does not
name a process, so Rush says "another Rush process". Rush that routing keeps in-process (such as `--no-daemon`,
`RUSH_DAEMON=0` or CI), `rushx-client`, and a workspace that selects another Rush release than the one the client
bundles fail at once, as native Rush does.

`--no-wait` fails immediately when daemon admission is unavailable.
`--wait-timeout SECONDS` (or `--wait-timeout=SECONDS`) overrides the configured queue
timeout; finite nonnegative decimal seconds up to 2147483.647 are accepted and
rounded down to milliseconds. These controls are mutually exclusive and are
consumed before forwarding, never appended to a project script. Arguments after
`--` remain literal script arguments.

Only time that the request spends waiting for other requests counts against the
queue timeout, whether it comes from `--wait-timeout`,
`RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS`, `daemon.queueTimeoutSeconds` in `rush.json`,
or the built-in 30-second default. Waiting while another request
loads or reloads the workspace graph does not count, so every build that arrives
while the first build after startup loads the graph runs once the load finishes.
That wait fails after 10 times the timeout (5 minutes with the default), so a load
that never finishes does not hold other requests forever. The request's own work,
such as checking its inputs, loading the graph, routing and execution, does not
count either. A configured or per-invocation timeout also
limits waiting for a running build to start so that the request can join it (with
`joinRunningBatch`), waiting for a running build that the request could not join, and waiting for
the requests that the daemon is serving to finish before it restarts for the
request's environment. The built-in default does not: with it, a build that arrives
while a compatible build is already running waits for it to finish and then runs,
instead of failing after 30 seconds, and a request that needs a restart waits for
the requests that were running when it arrived to finish and then runs on the
restarted daemon. The default still limits a restart wait while the daemon runs a
`rushx` script, such as a dev server, which may not exit until it is stopped, and
while it serves requests that arrived later. A `rushx-client` script that arrives
while another request waits for the daemon to restart does not start on the old
daemon, where the restart would wait for it to exit: it waits for the restart and
then runs on the restarted daemon, and its timeout applies to that wait as it does
to the restart wait. `--no-wait` fails wherever the request would wait. On a
timeout, the client exits with code 1 and suggests `--wait-timeout`. It does not
suggest exporting `RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS`, because Rush versions that do
not recognize a `RUSH_` environment variable fail every command while it is set.
In legacy output and in `rushx-client`, the admission failure line
(`rush-client: daemon admission failed (wait-timeout): …`, or `(no-wait)`; in
`rushx-client` it begins with `rushx-client:`) gives the daemon's reason, as agent
mode's summary line does, so it names what the request waited for, such as a daemon
restart, and why the daemon restarts.

A request also waits while a Rush process that the daemon does not run, such as
`rush install` or a `--no-daemon` build, holds the repository's lock. Every timeout,
the built-in default included, limits that wait, since that process can run for any
length of time. Stderr, on a terminal and on a pipe, names the process at once
(`rush-client: waiting for another Rush process (PID 12345: rush install) to release
this repository's lock.`), and again with the time waited every 10 seconds
(`still waiting after 10s for …`); agent output shows it as the progress phase, and if the
daemon then restarts, `request resubmitted to the new daemon; preparing the workspace graph`
until the new daemon reports a queue position or starts the command. Only
Linux tells the PID and command; elsewhere the line says `another Rush process`. On
Linux, the name also says when that process is stopped, since it cannot release the
lock until something resumes it (`another Rush process (PID 12345: rush install; it is
stopped (state T), for example by SIGSTOP)`).
`--no-wait` and `--wait-timeout 0` fail at once, and the admission failure line of
these and of a timeout names the process. A request never waits for a lock that the
daemon itself holds for another request: it fails at once, as before.

Admission controls also apply to experimental graph requests, but not
`start|stop|restart|status|logs`. They affect daemon admission, and how long Rush that runs in-process after
the client tried the daemon waits for the repository's lock (see above); otherwise native fallback
retains native command behavior. Waiting positions are shown on interactive stderr,
and a wait for a daemon restart (see below) or for another Rush process on a pipe
too. Admission failures report their typed reason and a nonzero exit code.

Explicit reporter/output/log-level controls (`--reporter`, `--output`, `--log-level`,
`RUSH_REPORTER` other than `legacy`, or `RUSH_LOG_LEVEL`) retain the native frontend
reporter path, with or without `--no-daemon`, including `--reporter=ai`. The daemon client
does not silently reinterpret requests for JSON, AI, file, or other reporter formats.

A repository that opts into the native reporter with `"useRushReporter": true` in
`common/config/rush/experiments.json` also stays on the native (in-process) path, so
that its reporter output is honored rather than silently replaced by the daemon
stream. Native reporter rendering over the daemon protocol is a follow-up.

### Output modes

The `rush-client` daemon path has two output modes (`rushx-client` always uses `legacy`).
Requests that use the native reporter path (see above) always get native output, and
agent mode writes nothing ahead of it. Otherwise, selection precedence is:

1. `RUSHD_OUTPUT=agent` or `RUSHD_OUTPUT=legacy`.
2. An active `COPILOT_CLI` agent marker selects `agent`, matching `detectAgent()` in
   `@rushstack/reporter` (a value is inactive when empty, `0`, `false`, `no` or `off`).
   Other agents can opt in with `RUSHD_OUTPUT=agent`.
3. Otherwise `legacy`: the unchanged collated operation stream.

Agent mode is plain text for humans and agents, not the AI reporter's JSON record format;
use `--reporter=ai` for machine-parsed records. On a TTY it paints at most three live rows, the
first before `@microsoft/rush-lib` is loaded. On a pipe it writes one progress line when the
daemon has the request (`rush build · 0.1s · sent to rushd; preparing the workspace graph
(status at least every 25s)`), however many operations run. A longer request also gets status
lines, so that it does not look hung: one whenever nothing was written for 25 s, with the counts
and the running operations, and one when connecting to the daemon takes more than 10 s. A
wait for a daemon that is still starting gets a line of its own
(`rushd is still starting; waiting for it (up to 15s more) because its startup helper (PID 4242) is
still waiting for the daemon`). A
request that waited for admission says so at the end of its summary line
(`· queued behind another request (position 1 at 0.2s)`), unless it failed: a failure's summary
line gives the failure, not the wait. It always ends with one summary
line, for example
`rush build: SUCCESS 772/772 operations (12 success, 760 from cache) in 3.1s`, or
`up to date (no operations needed)`, or, when the selection parameters matched no projects,
`rush build: SUCCESS 0 operations in 0.5s · the selection parameters did not match any projects`.
The counts follow the native summary: silent operations
(such as phases a project does not define) are not counted unless they fail, and operations
that did not need to run (`SKIPPED` or `NO OP` in native output) are counted as `up to date`. The verdict is
`SUCCESS`, `FAILURE` or `CANCELLED` (Ctrl+C or a termination signal); a request that a daemon
shutdown aborted is a `FAILURE` whose summary line gives the reason, with exit code 1. When the
daemon did not admit the request in time, or at once with `--no-wait`, the reason on the summary
line starts with `daemon admission failed (wait-timeout)` or `daemon admission failed (no-wait)`,
as in legacy output, followed by the daemon's reason in full. Warnings and errors that Rush or a
Rush plugin writes outside any operation (for example a plugin that continues without the cloud
build cache) are written at the end, at most three lines of them, before the summary line and any
operations reported with it.

A failed operation is reported as soon as it fails, while the rest of the request runs on: a
`failed: <operation> · full log: <path>` line and a short excerpt of its output, error lines
with the line that follows them first, then the last lines. Stack frames, `Require stack:` lists
and progress noise are left out, and so are a message that a tool repeats in its summary, an
error count that the shown errors account for, and, when the first error shown names a source
location, the lines before it. Up to three operations are reported. Two kinds are reported just
before the summary line instead: a failed operation that wrote no output, with the error from the
daemon's result, and, when no operation failed, the operations whose warnings failed the request
(`warnings: …`). An operation that succeeded and then got warnings, because its build cache entry
could not be written, is shown with the output that it wrote after it succeeded. The error of a
reported operation that wrote output is printed too, unless its excerpt shows it or it only gives
the exit code (`Returned error code: 1`): for example an error
thrown while the operation's build cache entry was restored. Only the daemon's result carries it,
so for an operation reported as it failed it comes just before the summary line, as an
`error: <operation>` line followed by the error. On a pipe, a status line names a failed
operation that wrote no output 1 s after it failed, unless the result came first. The summary
line names up to five failed (or warning) operations. Every operation's full output is in its
project's `rush-logs/` folder, whether or not it was printed.
When the daemon ran an operation's incremental command (its `<phase>:incremental` script; see
`incrementalBuilds` below) and that command failed, the line reads
`failed: <operation> · incremental command; its next run uses the initial command · full log: <path>`.
That command can fail where the initial command, which `--no-daemon` runs, would not. Warnings
that an incremental command reported get `· incremental command` in the same place.
When a request falls back to in-process Rush, agent mode stops and native output follows.

In agent mode a failed `rush build` doesn't wait for all of its work. Its result comes once an
operation failed and none of the selected projects that no other selected project depends on (for
example, the projects named by `--to`) is still waiting or running. The daemon keeps running the
operations that the failure didn't block, so that the next build finds them done, and the summary
line counts them and names up to three, in name order
(`· 2 independent operations continue in rushd: lib-b (build), lib-c (build)`). A later `rush build`
waits for them. While it waits only for them, its output says so and names up to three of them.
In agent mode the phase reads
`queued behind 2 operations left running by an earlier failed command (position 1): lib-b (build), lib-c (build)`,
a status line on a pipe reads
`waiting for 2 operations left running by an earlier failed command (queue position 1 at 0.1s): lib-b (build), lib-c (build)`,
and the summary line ends with
`· queued behind 2 operations left running by an earlier failed command (position 1 at 0.1s): lib-b (build), lib-c (build)`.
Legacy output on a terminal prints
`rush-client: waiting for daemon admission (position 1) behind 2 operations left running by an earlier failed command: lib-b (build), lib-c (build).`
The daemon reports the position again each time one of them ends, so the phase and the status
line name only the ones that still run; the summary line keeps the first position that named them.
`rush rebuild`, `rush install` and `rush update`, a restart of the daemon for another
environment, and `rush-client daemon stop` stop them instead. So does a command that the daemon
doesn't run (such as a custom command that it can't serve), before the client runs it in-process;
the client then prints, indented under its fallback line,
`rushd stopped 2 operations left running by an earlier failed command (lib-b (build), lib-c (build)), so that this command can run in-process.`
A served command that makes the daemon reload its graph, such as `rush test` after `rush build`,
stops them as well, and so does a served phased command that isn't incremental, such as a custom
`rush retest`. These commands and a served `rush rebuild` name them while the daemon stops them:
the agent phase reads
`stopping 2 operations left running by an earlier failed command (position 1): lib-b (build), lib-c (build)`,
a status line on a pipe reads
`waiting while rushd stops 2 operations left running by an earlier failed command (queue position 1 at 0.1s): lib-b (build), lib-c (build)`,
and if the command succeeds or is cancelled, its summary line ends with
`· stopped 2 operations left running by an earlier failed command (position 1 at 0.1s): lib-b (build), lib-c (build)`.
Legacy output on a terminal prints
`rush-client: waiting for daemon admission (position 1) while rushd stops 2 operations left running by an earlier failed command: lib-b (build), lib-c (build).`
Older clients say that such a command is queued behind them. Older daemons don't name them, so the
summary line ends with `· queued behind another request (position 1 at 0.1s)`.
Rushx scripts, and built-in commands that only read the workspace (such as `rush list`), run
in-process alongside them, like two Rush commands at once in one checkout.
Older daemons report the failure when all of the work has ended.

Positively identified built-in `install` and `update` follow the same opt-in routing
precedence as workspace builds and require protocol **0.10**
(`DAEMON_WORKSPACE_RESTART_PROTOCOL_MINOR`). They are not submitted to older peers.
Other package mutation, publishing, setup, management, and administrative commands
remain native rather than being forwarded as execution requests. Daemon management
subcommands use their separate control path. Rushx script names are not interpreted
as Rush built-ins. Arguments after `--` are preserved.
Request cwd, environment, argv, width and color are captured before connecting.
The protocol currently expresses request color as a boolean; subscriptions carry
the corresponding color level. There is no SIGWINCH forwarding.

The standalone host now binds native `build`/`rebuild` requests, and the phased
commands of command-line.json (such as `test`), to a reusable all-project graph.
Global commands still run in-process. Native Rush parsing, project selection, graph plugins, and
incremental/cache semantics are reused rather than spawning another Rush CLI.
The client renders operation headers, collated text, and activity events; global
command byte streams remain byte-preserving. A `rushx build` script never claims
to be a workspace build.

Rushx requests carry `invocationKind: "rushx"` (protocol 0.8), independently of custom
command origin. Native parsing recognizes `-q`, `-d`, and `--ignore-hooks` before the
command; subsequent flags and `--` belong to the script, apart from this client's
explicit admission/escape controls. Older peers fall back before receiving the request
or consuming input.

The standalone Rushx client conservatively keeps every script with TTY stdin, stdout, or stderr on
the native path, before connecting, auto-starting, or consuming input. Arbitrary
scripts may require raw mode or a controlling terminal, and a pipe is not a PTY.
There is no attempt to discover this requirement by running and retrying a script.
Fully non-TTY invocations retain daemon forwarding, binary byte parity, and EOF handling.
An embedded client that knows its script is pipe-safe can still submit a Rushx
envelope directly; it must declare any controlling-terminal requirement.

The default daemon installs `RushDaemonRequestResolver(existingRushResolver)` to enable real
package-script execution alongside native workspace builds. It reuses native Rushx parsing, escaping,
banner/diagnostics, lifecycle PATH and INIT_CWD preparation, dotenv precedence, and
pnpm injected-dependency synchronization. Only the actual script shell is spawned;
there is no Rush CLI child or synthetic warm graph. Native configuration discovery
is captured by the client and emitted only with daemon output, avoiding duplicate
discovery messages on fallback.

On Windows, Rushx retains native invocation-path spelling in script cwd, lifecycle variables and
pnpm-sync output, including 8.3 aliases and junctions. Daemon identity and confinement remain physical;
an alias does not create another workspace identity or permit execution outside the workspace.
Alias retargeting while queued fails before execution. Relative `RUSH_TEMP_FOLDER` initialization
uses safe in-process fallback.

The composite is exported for embedded hosts and wired into the standalone daemon.
No default or cutover flag is flipped. Active Rushx hooks, encrypted dotenv
vaults, changed process-global Rush configuration variables, stale workspace configuration,
and native help require pre-execution fallback. Ignored/recursive hooks retain native
behavior, including skipping post hooks after failure. PTY requirements remain in-process.
For forwarded Rushx, TTY output color/width overrides are applied after native
lifecycle environment preparation using the existing terminal policy helper.
Non-TTY requests retain their explicit environment values, including intentional
`FORCE_COLOR`/`COLUMNS` settings; no ambient daemon environment is merged in.

Compatible requests reuse the same native graph. Source changes refresh inputs;
changed configuration or command shape replaces the session and graph in the same
process. Environment, installed dependencies, implementation content, or selected
Rush version changes require a process restart rather than patching the existing
engine. Direct, inherited, and rig-based project configuration uses private native
loaders and is rechecked before execution. External plugins that participate in the
requested command (unassociated plugins, plugins associated with it, or plugin command-line
files that define it, its phases or parameters for either), `.env`, phased
watch/install options, and unsupported event-hook scripts still use typed
pre-execution fallback; plugins scoped only to other commands are permitted. This does not exclude the built-in `install` and `update`
commands described above. The native Rush lock is held for preparation and each
coalesced iteration, not while idle; native commands and `--no-daemon` can run
after a completed request without stopping the daemon.

Native workspace dispatch copies the request envelope and normalizes only the
engine-owned `_RUSH_LIB_PATH` to this daemon's own engine, keeping the spelling
that the engine chose when it loaded. Foreign client SDK paths therefore neither
select the wrong SDK nor cause a false restart. All other environment inputs
remain unchanged and participate in normal lifecycle checks.

Protocol 0.10 permits a bounded retry only when a pre-execution command result
explicitly carries `retryAfterRestart: true`. `executeWithDaemonRestartAsync`
waits for old ownership release and a validated successor, then resubmits an eligible
request **at most once**. Command input/output or cancellation prevents retry,
even with the typed flag. Unknown rejections and connection loss never authorize replay.
A started `install` or `update` is never repeated, including after a nonzero exit;
only an unstarted request can receive
the typed retry authorization. Accepted queued requests drain their typed restart
results before the old connection closes.

When the daemon's own installation was removed or replaced (for example a deleted
snapshot folder or a reinstalled Rush release), the daemon lets its running requests
finish, answers each other request with that typed restart once they have, and then
exits. The timeout rules of a restart for the request's environment apply (see
above): the built-in default does not limit waiting for the requests that were running
when the command arrived, but still limits it while the daemon runs a `rushx` script,
and `--no-wait` and an explicit `--wait-timeout` limit the whole wait. A command that
times out exits with code 1, names the changed folder and, if a script runs, suggests
stopping it. Otherwise the client starts a daemon from its own launcher once the wait
ends, resubmits the request, and prints one line on stderr (or above the agent
progress rows): `rush-client: The daemon's installation at <folder> was removed;
restarted the daemon (PID <pid>).`

While a command waits for a daemon restart, for its installation, the command's
environment or the workspace's inputs, the agent progress status (or stderr, on a
terminal and on a pipe) says what it waits for and why the daemon restarts, as soon as
the daemon reports the wait: `rush-client: waiting for 2 running requests to finish,
including 1 rushx script; the daemon (PID <pid>) then restarts, because
common/config/rush/pnpm-lock.yaml changed.` After `because`, the cause is `its
installation at <folder> was removed` (or `replaced`), `this request's environment
differs from the daemon's in NODE_OPTIONS` (variable names, never their values),
`<files> changed` for the workspace's installation, `the code of Rush or a Rush plugin
changed (<files>)`, or `this request selects Rush <version>`. The count names `rushx`
scripts, because a script such as a dev server may run until it is stopped. A
`rushx-client` script that waits for another request's restart prints `rushx-client:
waiting for the daemon (PID <pid>) to restart for another request (2 requests ahead),
because <cause>.` The line goes to the stderr that the script writes to, which is a
pipe, because a `rushx-client` with a terminal runs the script in-process. Its first line
comes once `rushx-client` itself has started and sent the request, which takes about half a
second on a busy machine. A native `install` or `update` restarts the daemon once it ends,
unless it fails before it changes the installation (for example on the Rush lock), and
that restart would end the `rushx` scripts that the daemon runs. The daemon can't tell
beforehand whether the command will fail, so it first waits for them and says so the
same way: `rush-client: waiting for 1 running rushx script to finish, since this command
restarts the daemon (PID <pid>), which would end it.` A terminal
gets a line whenever the wait changes, and a pipe when the wait begins or its cause
changes. Both get the line again with the time waited (`still waiting after 25s for
…`) whenever 25 seconds pass without one, until the command follows the restart,
starts, or ends. Once the client asks rushd to cancel the command (Ctrl+C) and says so,
it writes no more wait lines. In agent mode, the progress phase says it, and on a pipe
a status line is written at once when the wait begins or its cause changes.

When the daemon restarts for a command's environment, the client prints a line of the
same kind that names the variables that differed, never their values:
`rush-client: A command's environment differed from the daemon's in NODE_OPTIONS;
restarted the daemon (PID <pid>).` It names at most four variables and then says how
many more differed (`A, B, C, D and 2 more`). A command that was waiting when another
command's environment restarted the daemon prints that command's variables, because the
successor starts with that command's environment. A daemon that does not name the
variables gets no line. A variable name that holds a control character, such as a newline
or ESC, is printed with that character written as a `\xHH` escape, so the line stays one
line.

If the daemon that replaces it does not start, after either kind of restart, the command
fails with exit code 1 and one line that gives the reason for the restart before the
startup error: `rush-client: A command's environment differed from the daemon's in
NODE_OPTIONS; the restarted daemon did not start: <startup error>`. A variable that keeps
the daemon from starting is then among the names in that line.

The client leaves out the `…; restarted the daemon (PID <pid>).` line of either kind when
the command already wrote a wait line (see above) for the same cause since it last
restarted, because that line said why the daemon restarts: the same variables, or the same
change to the same installation. The wait line counts when it was written as a line, on
stderr or as an agent status line on a pipe. With agent output on a terminal, the wait is
only in the live rows, so the line is printed above them.

When the connection is lost before a command's result, the command fails with exit code 1
and is not retried. The diagnostic keeps "Daemon disconnected before delivering a result; the
command was not retried." and says what happened to rushd. If its process exited (a crash, an
out-of-memory kill or a signal), it names the PID, points to `rush-client daemon logs` and, if
the daemon exits again, to `--no-daemon` (`rushx-client --no-daemon` for Rushx), and quotes on a
second line the fatal error that the launcher log recorded after the command was sent. Before it
prints that, the client removes the exited daemon's ownership record and socket, as the next daemon
start would. On Linux, it first stops the operations that the daemon left running, so a rerun, with
or without `--no-daemon`, does not race them.
Rush run in-process, with `--no-daemon` or as a fallback, first does the same when the ownership
record names a daemon that no longer runs, for example when the client that ran the command was
killed along with the daemon. On Linux that includes a daemon that has exited but is not reaped yet:
the client waits up to 1 second for it to be reaped, and else runs Rush without the reclaim, which a
later command does once the daemon's parent reaps it. Each of these reclaims, and the ones that `daemon start`, an automatic
start and `daemon stop --force` do, prints one line that says what it stopped, for example:

```
rush-client: Stopped the operations that the exited daemon (PID 4242) left running (process group 4242).
```

The line begins "Killed" instead, and ends "they did not exit after SIGTERM", when an operation
needed SIGKILL. While agent mode shows its progress lines, the line is written among them.
If rushd still runs, it says that only the connection closed. Ctrl+C and an orderly `daemon stop`
or `daemon restart` still end a command as cancelled (exit code 130).

A command that was still waiting in rushd's queue when rushd exited has not run, if rushd says
when it starts a command (protocol 0.14) and had not said so. The client then sends it to a new
daemon once, within its `--wait-timeout`, and before that daemon starts it prints one line on
stderr (or above the agent progress rows): `rush-client: rushd (PID <pid>) exited while the
command was queued; sending the command to a new daemon.` In agent mode the phase, and the status
lines on a pipe, then read `request resubmitted to the new daemon; preparing the workspace graph`
rather than what the command waited for in the exited daemon's queue, until the new daemon reports
a queue position or starts the command. If the new daemon does not start,
the command fails after that line with the startup error. If the connection to the new daemon
is lost too, the diagnostic begins "Daemon disconnected before delivering a result; the command
was already sent to a new daemon once." Commands that waited together reach the new daemon in
the order in which their clients noticed that rushd exited, not in their order in the queue.

While a command runs, the client checks that rushd still responds. Once rushd has sent nothing
for 10 s, the client pings it. Once it has sent nothing for 30 s, not even the reply, for example
because its process was stopped, the client says so at once and says what that means:
`rush-client: rushd (PID <pid>) has not responded for 30s; its process may be stopped or
overloaded; on Linux, "rush-client daemon status" says which. This command goes on if rushd
responds; interrupt it (Ctrl+C) to stop waiting.` When
rushd sends anything again, a second line says so: `rush-client: rushd (PID <pid>) responded again
after 70s.` In agent mode, the progress phase says it; on a pipe both lines are written at once,
and until rushd responds, the status lines say how long it has not responded instead of what runs.
Time in which the client itself was stopped or busy writing output does not count. An interrupt
asks rushd to cancel the command, which a stopped rushd cannot confirm, so the client stops waiting
when its 5 s cancellation wait ends, and writes no more of these lines once it asked. Daemons older
than protocol 0.13 are not checked.

When the process that reads the client's output exits first, for example `head` in
`rush-client build | head -5`, the client's next write to that stream fails with EPIPE. The client
does not report that as a lost connection. It asks rushd to cancel the command, waits for the stop
as it does after Ctrl+C, and exits with code 141 (128 + SIGPIPE), which a shell reports for a writer
that SIGPIPE ended. Instead of the cancelling and cancelled lines it prints one line, which names
the stream: `rush-client: build cancelled, because the process reading its stdout exited (EPIPE).`
In `rushx-client` it begins with `rushx-client:`.
Agent output prints the same line on stderr. The client only learns of the exit at its next write,
which in agent output on a pipe can be the next status line, up to 25 s later. A command whose
result arrived before a write failed keeps the result's exit code. Rush run in-process and
`rush-client daemon logs` still report a failed write as an error.

Piped input uses protocol 0.7's negotiated stdin admission and EOF. The client does
not read input until the command attaches an input destination, and sends bounded
chunks only as the daemon grants write credits. EOF follows all preceding writes;
binary Ctrl+C bytes in a pipe are data, not cancellation signals. Older peers fall
back before `requestStart` or input consumption, and pre-execution command fallback
preserves the complete pipe for the native entrypoint.
The existing Rush entrypoints resolve project scripts from cwd. Fallback loads the
existing `@microsoft/rush` version-selecting entrypoint in the client process,
preserving its startup checks, output and reporter integration instead of
inventing a cached module path. Before auto-start or explicit start/restart, the client
selects an available daemon whose installed engine is exactly the requested Rush
version, including a native `RUSH_PREVIEW_VERSION` override. It can install a published
daemon release declaring that exact engine dependency into a node-specific Rush cache;
it never overrides dependencies or relabels the bundled engine. Foreign installations
are probed in isolation, and startup rechecks actual runtime version, protocol, and
default request-launch APIs before binding. Incompatible or unavailable launchers use
native fallback for ordinary invocations and fail explicitly for management commands.
Connect-only calls never install packages. Older Rush versions may also reject the new `daemon` config block; use
environment-only opt-in until a supporting Rush release is selected.

## Configuration

Every setting uses **environment > config > default**. Boolean overrides accept
only `0`/`1`; numeric overrides accept finite unsigned decimal numbers. Unknown
keys and unknown `RUSH_DAEMON*` variables fail validation.

| `daemon` key | Environment override | Default | Runtime status |
| --- | --- | --- | --- |
| `enabled` | `RUSH_DAEMON` | false | Client routing |
| `autoStart` | `RUSH_DAEMON_AUTO_START` | true | Only after opt-in |
| `idleTimeoutSeconds` | `RUSH_DAEMON_IDLE_TIMEOUT_SECONDS` | 900 | Host idle shutdown after request/output/cleanup drain |
| `queueTimeoutSeconds` | `RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS` | 30 | Admission wait limit. Time behind another request's graph load (up to 10 times the limit) and the request's own work do not count. The default does not limit waiting behind a running compatible build, or, for a daemon restart, behind requests that were already running (while no `rushx` script is running); an explicit value does |
| `watch` | `RUSH_DAEMON_WATCH` | false | Persistent host observation of requested warm projects; false keeps root/config guards only. Never schedules builds |
| `usePersistentIpcRunners` | `RUSH_DAEMON_USE_PERSISTENT_IPC_RUNNERS` | false | Enables explicit per-operation `daemonIpc` Node launchers for unsharded incremental daemon builds |
| `incrementalBuilds` | `RUSH_DAEMON_INCREMENTAL_BUILDS` | true | Runs an operation's `<phase>:incremental` script instead of its initial script when only files it builds were edited since its last successful run in the daemon and its output folders are unchanged. Additions, deletions, renames, configuration, tool, environment and command-line changes, bundled outputs, cache restores and native Rush commands run the initial script. Incremental results are never written to the build cache |
| `warmWorkers` | `RUSH_DAEMON_WARM_WORKERS` | false | With `incrementalBuilds`, keeps a watch-mode worker (the `<phase>:incremental:ipc` script) alive between builds for each operation whose `rush-project.json` operation settings set `allowDaemonWarmWorker`, and sends it the next incremental run. Opt in only if that script runs every task and check that the initial script runs, for Heft including lint and API Extractor. When an incremental run is not allowed, the worker is closed and the initial script runs. Workers count toward `warmMemoryBudgetMB` and `warmSetMaxProjects`, so raise both to keep them alive |
| `joinRunningBatch` | `RUSH_DAEMON_JOIN_RUNNING_BATCH` | false | Experimental. A build request that arrives while the daemon executes an incremental batch with the same request settings adds its operations to the executing iteration and gets its result once they complete, instead of waiting for the iteration to end. When the iteration can't take its work, the request waits as before |
| `deferCacheWrites` | `RUSH_DAEMON_DEFER_CACHE_WRITES` | false | Lets an operation complete once its output files are cloned, and writes its build cache entry from the clones in the background. Needs a file system that can clone files (such as Btrfs, XFS or APFS); otherwise, and in cobuilds, the entry is written before the operation completes. A failed background write doesn't change the operation's status; the next command reports it in a warning (on stderr in legacy output), which agent output also prints. A restore of the entry's key misses until the entry is written, and `daemon stop` drops the entries that aren't written yet |
| `backgroundPrepare` | `RUSH_DAEMON_BACKGROUND_PREPARE` | false | Experimental. When a watched workspace input changes so that the next request would reload the workspace graph (`lastReloadTier` 1), for example after an edit of `rush.json` or `common/config/rush/command-line.json`, an idle daemon reloads it and creates the engine for the command line of the last phased command that it served, 2 seconds after the last change. It never runs an operation or restarts the daemon, and it doesn't start while another Rush process holds the repository lock. A request with the same command line waits for it; any other request stops it and runs as before |
| `warmIdleTimeoutSeconds` | `RUSH_DAEMON_WARM_IDLE_TIMEOUT_SECONDS` | 300 | Idle runner, project-watcher and retained-result eviction |
| `warmMemoryBudgetMB` | `RUSH_DAEMON_WARM_MEMORY_BUDGET_MB` | 512 | Best-effort sampled RSS budget in MiB, not a hard ceiling. Compared against whole-daemon RSS plus measured child RSS, so keep it above the daemon baseline (~130-190 MiB) |
| `warmSetMaxProjects` | `RUSH_DAEMON_WARM_SET_MAX_PROJECTS` | 20 | Best-effort limit on projects holding warm resources (active runners, watchers); retained results of resource-free projects do not count. Never trims requested execution |
| `autoWarmByTelemetry` | `RUSH_DAEMON_AUTO_WARM_BY_TELEMETRY` | false | Measured retention ranking with conservative LRU fallback; no speculative scripts |

For genuine persistent Node execution, enable `usePersistentIpcRunners` and add
`operationSettings[].daemonIpc: { entryPoint, args? }` in the project's `config/rush-project.json`.
`entryPoint` is explicitly project-root-relative, including for inherited/rig settings, and must reside in a
dedicated implementation subdirectory. Node is spawned directly on Linux and Windows; args are literal tokens,
followed by non-ignored native custom parameters. Arbitrary shell strings are not reinterpreted.
The complete implementation directory is fingerprinted (256 entries, 16 levels, 8 MiB maximum); imports outside
it other than Node built-ins are unsupported. Ordinary input/output files must live outside that directory.
Code or descriptor changes replace the old generation, while ordinary input changes reuse the child.
The tool must implement the native IPC protocol and report real RSS; no extra runs manufacture telemetry.
IPC is non-cacheable. Rebuild, NoOp/missing-script behavior, preassigned shards and non-opted-in/native paths
stay unchanged, and existing watch-only IPC declarations do not activate this mode.
Ordinary `daemon status` reports raw measured `workspace.warmSet.projectRanks` when available.

Timeouts must be positive and at most 2147483.647 seconds; queue timeout additionally
accepts zero and is rounded down to milliseconds. Memory budget must be positive
and no larger than JavaScript's maximum safe integer. Project count must be a
positive safe integer. The session automatically owns these warm policies for its real
graph and watchers. Executing/prepared work and protected resources are not evicted.
Missing child-memory measurements stay explicitly unknown; unavoidable active/base
memory pressure is reported rather than hidden. No warm-set setting changes build correctness.
Project observation previously ran regardless of `watch`. Its existing default `false`
now disables host project observation; set it to `true` to retain observation between
requests. Every explicit native request still refreshes inputs and effective configuration.
Changing this flag neither discards warm results/runners nor starts scripts; safe idle
maintenance applies watcher changes and reports deferred or failed cleanup.

## Management

`rush-client daemon start` explicitly requests startup, independently of
`daemon.enabled`, `autoStart`, or CI execution routing. It conflicts with
`--no-daemon`. It is idempotent: an existing compatible daemon is reused, not
reconfigured. Startup uses the same detached, locked launcher as automatic
startup and selects an attested launcher rather than guessing a path for another Rush version.
With an explicit matching launcher, a daemon implementation-version mismatch triggers
ownership-checked replacement under the start mutex before executing any command.
It does not replace a peer lacking safe shutdown support. Foreign package installation
is a client preparation step; host self-restart selects only bundled or already cached
compatible installations, never installing while the old workspace is being cleaned up.

Every client of a checkout finds its daemon in one per-user runtime folder: on Linux and
macOS, `/tmp/rushd-<uid>/`, whatever `TMPDIR` or `XDG_RUNTIME_DIR` a shell, job, service or
sandbox sets. It holds the socket (`<key>.sock`), the ownership record
(`<key>.pid.json`) and the launcher log. To move it, set `RUSHD_RUNTIME_DIR` to an absolute
path for every client of that checkout; the folder becomes `$RUSHD_RUNTIME_DIR/rushd-<uid>/`,
and its file system must support hard links. A relative `RUSHD_RUNTIME_DIR` is ignored. Clients
that disagree about `RUSHD_RUNTIME_DIR` use different folders, so each folder gets its own daemon
for the checkout. A client passes the folder to the daemon it starts.
The socket path must fit in a socket address: at most 108 bytes on Linux and 104 on macOS.
`RUSHD_RUNTIME_DIR` can therefore be at most 57 bytes on Linux and 53 on macOS, minus the
number of digits in your uid (50 bytes on Linux for uid 1234567).
Windows uses the named pipe `\\.\pipe\rushd-<key>` and is unchanged.
The client refuses a runtime folder that is a symbolic link, is not a directory or belongs to
another user, and a `RUSHD_RUNTIME_DIR` too long for the socket path: commands run in-process
with that reason, and `daemon` commands exit 1. Remove the folder or change `RUSHD_RUNTIME_DIR`.
Auto-start likewise refuses a launcher log that is not a regular file of yours with one link, or
that it cannot open for writing, such as a symlink, a directory or a FIFO: commands run in-process
with that reason (for example `Launcher log cannot be opened for writing (ELOOP): <path>`), and
`daemon start` exits 1. Remove the file.
A folder that others can open is made owner-only (`0700`).
Within one runtime folder, `TMPDIR`, `TMP`, `TEMP`, `XDG_RUNTIME_DIR` and `RUSHD_RUNTIME_DIR`
never select a different daemon; each operation receives the requesting client's values.
Clients and daemons before protocol 0.12 used `$XDG_RUNTIME_DIR/rushd-<uid>/` or the
temporary folder instead. A daemon started there stays there, where current clients do not
look, until it idles out or is stopped with that older client (`rush-client daemon stop`).
An older client that starts a current engine while `XDG_RUNTIME_DIR` or `TMPDIR` is set does
not find it and runs in-process, so upgrade `rush-cli-client` with the engine.
When a daemon before protocol 0.12 serves a current client, for example one listening in
`/tmp/rushd-<uid>/`, the client leaves `XDG_RUNTIME_DIR`, `TMPDIR`, `TMP` and `TEMP` out of
its requests on Linux and macOS, because that daemon would restart into the folder they name.
Its operations see the daemon's own values; stop it (`rush-client daemon stop`) to use yours.

`rush-client daemon status` only connects and checks hello/pong. It never starts
a process, reclaims files, or treats a PID file as evidence of readiness. Both
commands print one JSON object with `state: "ready"`, `socketPath`, and the actual
pong fields (`uptimeMs`, available versions, optional `pid` and
`residentMemoryBytes`, and an optional `workspace` snapshot). Exit code 0 means protocol
readiness, not build support. An unreachable/incompatible endpoint, invalid
arguments, or startup failure returns exit code 1 with a diagnostic. When no daemon runs
at all, status also exits 1, and its diagnostic says `No daemon is running for <repository>
(Rush <version>)` and what the next command does: with `enabled` and `autoStart`, the next
rush-client command that uses the daemon starts one; otherwise rush-client commands run Rush
in-process. This is the normal state after `daemon stop`, the idle timeout or SIGTERM. Status
reports it only when the endpoint refuses connections and neither an ownership record, a startup
reservation nor (outside Windows) a socket file remains; with any of these, the diagnostic
still says that it could not connect. When the endpoint
refuses connections and its ownership record (`<key>.pid.json`) names a PID that no longer
exists, the diagnostic adds that rushd exited without shutting down (an orderly shutdown
removes the record) and that `daemon logs` may show why. When that PID still exists but the endpoint
refuses connections or does not complete hello/ping, the diagnostic adds what that process is doing,
on Linux for example `rushd (PID <pid>) still owns <key>.pid.json: it is stopped (state T), for example
by SIGSTOP, and it started 5 min ago.`, and on the next line what to do about it.
A client that lost its connection to that daemon, or that ran Rush in-process, removes the record
when it reclaims the daemon, and appends a line that names the daemon to the launcher log. Until a
daemon becomes ready again or `daemon stop --force` resets the workspace, the `No daemon is running`
diagnostic then adds `The last daemon, rushd (PID <pid>), exited without shutting down; "rush-client
daemon logs" may show why.`
A daemon whose installation was removed or replaced still answers, but it restarts on
the next command: status then prints `state: "installationChanged"` with the pong's
`installationChange` (`change` and `folder`), a hint on stderr, and exits with code 1.

A startup reservation (`<key>.pid.json.starting`) refuses another daemon launch until
the daemon it reserved becomes ready. Status reports one that remains as
`startupReservation` with its `path`, the startup helper's `helperPid` when recorded, and
`helperState`: `running` (the helper still waits for readiness), `exited` (the helper will not
release it), or `unknown` (written by an older client). Status never removes it. Next to a
ready daemon, the next command that uses, stops or restarts that daemon removes it; when status
cannot connect, its diagnostic explains the reservation. After an `exited` helper, status also
reports `relaunchAfter`, 15 seconds after that helper was launched. Until then every automatic
start is refused at once (the command runs in-process), so that a daemon that fails the same way
each time, for example because of a configuration error, is not launched by every command. The
first command after it that finds nothing listening at the endpoint takes the reservation over
and starts the daemon again, and `daemon logs` shows a line saying so. `daemon logs` may also show
why the daemon did not become ready.

The optional workspace snapshot reports the provider generation/token, graph existence,
and available warm accounting without initializing a graph. Missing fields are unknown,
not proof of zero memory or successful reload. Status can inspect a protocol-compatible
daemon with a different implementation version; start requires the bundled version to match.

| `workspace` field | Meaning |
| --- | --- |
| `generation`, `generationToken` | Current provider generation and installed session identity |
| `lastReloadTier` | Lifecycle-owned `0` initial/reuse, `1` successful in-process reload, or `2` requested restart; older peers may omit it |
| `graphInitialized` | A graph exists; this does not attest build success |
| `warmSet.configuration` | Effective `watch` and four warm-resource settings; older peers may omit `watch` |
| `warmSet.maintenanceState`, `warmSet.maintenanceFailure` | Running, quiescing, stopped or failed maintenance; stopping it does not itself free resources |
| `warmSet.retainedProjectNames`, `warmSet.protectedProjectNames`, `warmSet.watchedProjectNames` | Actual retained/protected projects and resident project observation |
| `warmSet.daemonResidentMemoryBytes`, `warmSet.measuredRunnerMemoryBytes`, `warmSet.unmeasuredRunnerCount` | Daemon RSS, last-completion child RSS samples, and explicitly unmeasured resident runners; descendants are not included |
| `warmSet.overMemoryBudget`, `warmSet.overProjectLimit`, `warmSet.cleanupFailures`, `warmSet.deferredReason` | Outstanding footprint pressure, cleanup failures and maintenance deferral |

An absent `warmSet` means no controller is attached, not that the workspace consumes
no memory. Status reads `lastReloadTier` from the lifecycle (zero for a host without one);
it does not infer a tier from PID/generation changes or initiate a reload. Tier `2`
attests a restart request, not completion of successor startup or success of a command.

`rush-client daemon stop` requires protocol >= 0.6 and waits for `shutdownAck`
followed by EOF. It reports `state: "shutdownAccepted"` with exit code 0; this
does not assert successful workspace disposal. Stop is idempotent: when nothing
listens at the endpoint and no daemon is starting, it reports `state: "notRunning"` with exit code 0.
When nothing listens but the ownership record names a process that still runs, for example a daemon
that removed its socket while it shuts down, stop first waits up to 15 seconds for that process to exit,
and says so on stderr once it has waited a second. If it still runs then, stop exits with code 1 and
says what that process is doing and what to do about it; a daemon that accepts the connection but does
not complete hello/ping gets the same diagnostic. On Linux, stop does not wait for a Rush daemon that
has this workspace's ownership record open and stays stopped (state T or t) while stop samples it for
1.5 s, because it cannot exit before something resumes it: stop exits with code 1 and that diagnostic
once the 1.5 s have passed.
While a daemon is still starting (its startup helper still runs, or another client holds the start
mutex), stop says so on stderr and waits up to 15 seconds for that daemon to become ready, then stops
it as below; reporting `notRunning` would leave it running afterwards. If it is still not ready by then,
stop exits with code 1 and leaves it running; run stop again once `daemon status` reports it ready. An
unsupported protocol, missing acknowledgement, handshake failure, or timeout
returns exit code 1. It does not auto-start anything. Before shutdown, it removes a startup
reservation that remains next to that daemon, as restart does, so that the reservation cannot
refuse the next start once the daemon is gone. It does so only for the live owner in the
ownership record, under the start mutex (waiting up to 15 seconds for it); a reservation that
it cannot resolve stays in place and is reported as `startupReservation`.

`rush-client daemon stop --force` stops a running daemon the same way, then waits
(up to 15 seconds) for it to release its listener and ownership record and removes
any remaining artifacts, such as an abandoned startup reservation, reporting them in
`removedPaths`. When none is listening, it removes this workspace's leftover ownership record
(`<key>.pid.json`), socket, and startup reservation (`.starting`), then reports
`state: "reset"` and the `removedPaths` (or `state: "notRunning"` if nothing was
left behind). It holds the start mutex, proves that no listener is bound, and
refuses (exit 1) while the recorded owner PID still exists and cannot be shown to
be a reused PID, saying what that process is doing, that no process was killed, and what to do about it.
It fails the same way, without killing that process, when that process accepts the connection but does
not complete hello/ping, for example because a signal stopped it. When the recorded owner PID no longer exists, the daemon exited without shutting
down and may have left operations running that only its records name, so the reset first stops them
as the next daemon start would: SIGTERM, then SIGKILL 2 seconds later, to the daemon's own process
group and to each operation process group that it recorded whose leader still has the recorded start
time (or has exited, while every live member of the group is in the group's own session and one of
them still has the `RUSHD_OPERATION_GROUPS` variable that the daemon gives the processes it starts). When a
process that started after the record was written has the recorded PID now, the daemon exited the same
way, so the reset stops the operation process groups that it recorded the same way, but never the
process group whose ID is that PID, which the later process may lead. It prints the
line shown above for a lost connection and reports what it stopped in `orphansReaped` (`daemonPid`,
`processGroupIds`, `outcome`). A recorded group that it cannot prove, such as a PID that a later
process now has, or a group whose leader has exited under a daemon from a release that did not set
`RUSHD_OPERATION_GROUPS`, is not signalled; its record is removed with the others. When such a group still
has a live process, the launcher log that `daemon logs` prints gets a line that names the group and the
daemon and says which check the group failed; nothing about it is printed. The reclaims after a lost
connection, before Rush runs in-process and before a daemon start do the same. If the operations cannot be
stopped, it exits with code 1 and removes nothing. While another process reclaims the same files it
also exits with code 1, except that after a shutdown it re-checks for up to 15 seconds. Otherwise it
never signals a process. Automatic startup already reclaims
the common leftovers on its own (see below); this is the documented escape hatch
that every fail-closed startup message points to. A reset also appends a line to the launcher log
that clears the report of a daemon that a client reclaimed, so status no longer names it.

`rush-client daemon restart` first verifies that the selected Rush version has a
launcher and captures the original lock's PID/start timestamp, checking that it
matches pong's positive PID and the selected endpoint, then performs acknowledged
shutdown. Before shutdown, it removes a startup reservation that remains next to that
daemon (under the start mutex), so that the reservation cannot refuse the successor; if
another client holds the mutex for 15 seconds, restart fails without stopping the daemon.
It waits for original ownership release or a demonstrably dead owner
before calling the existing locked starter. A live owner fails closed at
the startup deadline; no PID is killed and no live ownership record is deleted.
A newly
started/reused successor must pass hello/ping before reporting `state: "ready"`.
When nothing listens at the endpoint, restart starts a daemon exactly like `daemon start`.

Automatic and explicit startup reclaim stale artifacts only when that is provably
safe: while holding the start mutex with no `.starting` reservation (or after taking over
one whose helper exited, as described above), a socket
without an ownership record, or an unreadable/corrupt record, is removed only after
a connection attempt is refused (so no listener exists). On Linux, a record whose
PID now belongs to a process that started after the record's `startedAt` (PID reuse)
is treated as dead; other platforms fail closed and point to `daemon stop --force`. Before such a
record is removed, the operation process groups that the daemon recorded are stopped as
`daemon stop --force` stops them, and the line shown above for a lost connection is printed; if they
cannot be stopped, the command fails and the record stays.

Restart is explicit even when automatic startup or CI execution routing is
disabled, but conflicts with `--no-daemon`. The two-phase host retains ownership
until workspace disposal succeeds, so embedded hosts can restart a workspace
without exiting their process. Failed cleanup retains the live lock and causes a
bounded restart failure, even if the socket has already disappeared. A changed
owner is reconnected and validated, not overwritten.

`rush-client daemon logs` prints a snapshot of the selected workspace's launcher
log, whether the daemon is running or stopped. It never connects or auto-starts.
The stable path comes from `getDaemonLogFilePath(paths)`: `<lockfilePath>.log`.
Detached child stdout and stderr are appended to this file across restarts; the
parent closes its descriptor after spawning. On POSIX the launcher enforces mode
`0600` and rejects linked destinations; Windows uses the existing per-user
transport directory permissions.

Each daemon writes `<time> rushd ready at <socket> (Rush <version>, PID <pid>)` when it
is ready, and `<time> rushd (PID <pid>) shutting down: <reason>` when it begins to shut
down. The reason is `received SIGTERM` or `received SIGINT`; `requested by a client`, for
`daemon stop`, `daemon stop --force` and `daemon restart`; `idle for <seconds> s`;
`its socket file was deleted or replaced`, after the line that reports the lost socket;
or a restart, with its cause. A daemon that is killed (SIGKILL, or SIGHUP, which it does
not handle) writes no such line, and a crash still writes its stack.

Default reading is bounded to the size observed when the log is opened, with chunked,
backpressured output. Empty snapshots succeed without output; missing/unreadable logs
or invalid destinations fail with a diagnostic and exit code 1. A launcher log
may not exist for a daemon started outside this client.

`rush-client daemon logs --follow` also streams bytes appended after EOF, using
at most 64 KiB per read and waiting for output backpressure before reading more.
It never connects or starts a daemon, including when following an empty log.
SIGINT/SIGTERM cancel following with exit code 130 after closing the log descriptor;
pending display bytes may be discarded rather than keeping the client alive
indefinitely behind a stalled output pipe. Read/write failures remain explicit errors. Truncation,
replacement, or removal fails explicitly instead of silently following the wrong
file; reopen the command after rotating a log. No automatic rotation policy is added.

On Windows, following redirected stdout uses an invocation-owned, output-only Node
process. Windows pipe writes can block the CLI event loop, and moving a blocked
write to its filesystem thread pool alone can still prevent shutdown. The CLI
instead sends one acknowledged chunk of at most 64 KiB to the isolated writer.
Cancellation stops and joins that writer before the CLI exits; a lost parent
also terminates the writer, so blocked display output is not orphaned. The worker
does not run user `NODE_OPTIONS` preload hooks or any Rush command. This is not
daemon startup. Default snapshots, TTY output, and the non-Windows output path
retain their existing stdio behavior.

This is the **text launcher stdout/stderr log**, including startup errors—not
WS5 structured observability or a subscription to request-scoped events.

## Experimental graph reference client

Set `RUSH_DAEMON_EXPERIMENTAL=1` and use an explicitly started daemon:

```sh
export RUSH_DAEMON_EXPERIMENTAL=1
rush-client daemon start
rush-client daemon graph show
rush-client build --to my-project
rush-client daemon graph scope-out --project my-project
rush-client daemon graph scope-in --operation 'my-project (compile)'
rush-client daemon graph invalidate --project my-project
rush-client daemon graph pause
rush-client daemon graph status
rush-client daemon graph resume
rush-client daemon graph watch
```

All graph commands connect only; they never auto-start, initialize the graph, or
fall back to native Rush. Cold `show` and `status` report `initialized: false`
without an `operations` field. Other verbs fail explicitly until a supported,
explicit build request has initialized the graph. The gate is checked both by the
CLI and against the server request's environment. Older or unsupported servers,
invalid arguments, and unknown selectors fail, never invoke a shell.

`show` and `status` both emit a complete point-in-time metadata snapshot, including
operation IDs, exact project/phase names, native enabled states, observed statuses,
dependency IDs, manual-mode/scheduled flags, and a path-free invalidation summary.
An operation without an observed execution status reports `null`. An idle operation
whose actual completed result was evicted reports `READY` for request-time revalidation,
not historical success; inspection does not schedule work. Snapshots contain no
environment, runner, log, or terminal objects.

Protocol 0.9 snapshots include an opaque `workspaceGeneration` token. Every mutation
echoes a token, checked under exclusive admission before touching the graph. The
token changes on soft reload and process replacement, preventing stale operation
references from affecting a new generation. Use `--generation TOKEN` with a token
from an earlier snapshot to preserve that reference; the client never refreshes an
explicit token. Without this option, the client privately reads current status
before submitting the mutation. A reload between those requests fails closed.
Mutations reject older peers before submission; read-only inspection remains compatible.

Graph requests use the same resolved queue options as ordinary execution:
`--no-wait`/`--wait-timeout` override environment, config, and the 30-second default.
An implicit generation lookup and its mutation share one positive admission
deadline; time spent connecting and reading the token is not reset before the
mutation. If the budget expires, no later query is sent. Zero requests immediate
server admission, as does `--no-wait`, without imposing a zero-length connection
timeout. Cancellation covers generation preflight too. Once a mutation is admitted,
its execution is not timed out by the admission budget.

`scope-in`, `scope-out`, and `invalidate` require one or more repeated
`--project NAME` or `--operation ID` pairs. Names and IDs match exactly; there are
no globs or implicit all-project selections. Every selector is validated before
any mutation. Scope-in enables transitive dependencies. Scope-out includes
transitive consumers and uses native safe-disable, which also prunes dependencies
no longer needed by enabled operations. Invalidation marks selected native results
stale without scheduling work. Mutations use exclusive workspace admission and
never change an active iteration. Scope changes/invalidation reject an already
prepared iteration instead of modifying stale execution records.

Pause/resume change native `pauseNextIteration`: manual mode gates automatically
scheduled iterations, **not explicit build requests**. Resume does not create new
work. If an engine owner has already prepared an automatic iteration, resume
acquires the native execution lease, discards the old unstarted plan, reconciles
inputs, and prepares its replacement before releasing it. Admission and the native
lease remain held until native idle, including
if the resume client disconnects. The reference client's watch command is not a
build scheduler; the default lazy engine still rebuilds only on explicit requests.
Native build requests apply their own selections, so a graph scope is not a
persistent override of later build arguments.

Graph stdout is NDJSON only. Snapshots use the existing `extension` event envelope
with `payload.name: "rushd.graph-snapshot"` and
`payload.data: { requestId, snapshot }`. The existing `requestResult` is emitted as
the terminal record; queue positions and request rejections also retain their
control-message shapes. Local failures use `{ kind: "graphError", message }`.
No human renderer, ANSI styling, or graph-specific transport is involved.

`watch` emits an initial snapshot followed by relevant graph state, invalidation,
and idle updates. It holds no scheduler lease, so other clients can build.
Slow consumers receive coalesced latest snapshots rather than every intermediate
transition or an unbounded event history. SIGINT/SIGTERM cancel the subscription
and wait for the authoritative aborted result (exit 130). Disconnect removes
subscriber resources without cancelling another client's build. Graph hooks are
installed once per graph, not once per connection.

## Remaining epic constraints

Origin issues #5894 and #5896 still require reconciliation with the canonical
reporter contract and built-in reporters. The current wire consumers use
`IDaemonEventEnvelope`/`DaemonEventType`; `ClientOperationRenderer` feeds
`DaemonRendererHost`, whose default is `LegacyCollatedRenderer`. These inherited
contracts are not replaced by the WS4 terminal, graph-admission, or log-follow
fixes. Explicit reporter controls continue to select the native reporter path.
Reporter reconciliation remains a separate epic decision, not an assertion that
the WS5 default flip or the full daemon transparency matrix has passed.
