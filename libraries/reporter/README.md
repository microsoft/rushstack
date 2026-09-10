# @rushstack/rush-reporter

Canonical event protocol, reporter manager, and built-in reporters for Rush.

This package is released as a public beta. Exported contracts may change before the stable release.

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
