# @rushstack/rush-reporter

Canonical event protocol, reporter manager, and built-in reporters for Rush.

This package is released as a public beta. Exported contracts may change before the stable release.

Bootstrap initialization failures close every destination whose initialization was attempted, including
partially initialized reporters, before propagating the original failure. Abandoned handoff cleanup applies
the 14-day retention window and a 20-session cap to files verifiably owned by the current user whose producer
process has exited. Live/current handoffs, foreign files, and entries without verifiable ownership are not
removed; timestamp ties are resolved by filename.

## Links

- [CHANGELOG.md](https://github.com/microsoft/rushstack/blob/main/libraries/reporter/CHANGELOG.md) - Find out
  what's new in the latest version
- [API Reference](https://api.rushstack.io/pages/reporter/)

`@rushstack/rush-reporter` is part of the [Rush Stack](https://rushstack.io/) family of projects.
