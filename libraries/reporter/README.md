# @rushstack/rush-reporter

Canonical event protocol, reporter manager, and built-in reporters for Rush.

This package is released as a public beta. Exported contracts may change before the stable release.

Bootstrap initialization failures close every destination whose initialization was attempted, including
partially initialized reporters, before propagating the original failure. Abandoned handoff cleanup applies
the 14-day retention window and a 20-session cap to files verifiably owned by the current user whose producer
process has exited. Live/current handoffs, foreign files, and entries without verifiable ownership are not
removed; timestamp ties are resolved by filename.

Bootstrap replay shares the frontend's canonical full-detail invocation log. That log remains
unfiltered at debug level even with `--reporter=file --log-level=normal`; selected levels filter
the visible reporter and explicit output destinations, not the canonical log.

Rush 5 keeps legacy terminal output by default. See the
[experimental Rush reporter guide](../../docs/rush/reporter.md) for opt-in controls, reporter behavior,
privacy boundaries, full-detail logs, bootstrap compatibility, and the reproducible repository demo.

## Full-detail log completion

The frontend reports an invocation log as complete only after its accepted events and grouped
output have been persisted and the file has closed successfully. Its final `artifactAvailable`
notification is delivered to the remaining reporters after that close; it is not appended to the
same closed log. The log retains command results and session completion, including failed commands.
Flush or close failures leave the artifact incomplete or unavailable and produce an emergency warning
without replacing the command's native exit result.

## Shadow lifecycle compatibility

Error correlation uses external weak metadata, so frozen and non-extensible errors retain their original
identity, cause, and properties. Correlation remains visible across bridge instances without keeping errors alive.

Rush command-line parse failures emit one session-scoped `RUSH_COMMAND_FAILED` diagnostic before completion.
The original parser message is retained in the diagnostic's local-sensitive `message` parameter; native error
rendering and exit codes remain unchanged. Operation registration observes the final iteration configuration,
so unchanged watch operations do not produce visible shadow registration or status events.

## Shadow parity

Rush's shadow session observer records the selected phased action's real cancellation state at completion.
A gracefully stopped watch command therefore derives the existing logical `cancelled` outcome on subsequent
observations, even when native Rush returns normally with process exit code 0. Legacy completion payloads and
binary telemetry results continue to describe that native exit; shadow reporting does not change process status.
The recorded cancellation state is reset when a new command starts.

Operation output parity tests compare raw terminal chunks, including stream identity and unnormalized ANSI
text, as well as the actual bytes on each stdout/stderr stream.

## Links

- [CHANGELOG.md](https://github.com/microsoft/rushstack/blob/main/libraries/reporter/CHANGELOG.md) - Find out
  what's new in the latest version
- [API Reference](https://api.rushstack.io/pages/reporter/)

`@rushstack/rush-reporter` is part of the [Rush Stack](https://rushstack.io/) family of projects.
