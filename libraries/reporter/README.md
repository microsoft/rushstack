# @rushstack/rush-reporter

Canonical event protocol, reporter manager, and built-in reporters for Rush.

This package is released as a public beta. Exported contracts may change before the stable release.

## Shadow lifecycle compatibility

Error correlation uses external weak metadata, so frozen and non-extensible errors retain their original
identity, cause, and properties. Correlation remains visible across bridge instances without keeping errors alive.

Rush command-line parse failures emit one session-scoped `RUSH_COMMAND_FAILED` diagnostic before completion.
The original parser message is retained in the diagnostic's local-sensitive `message` parameter; native error
rendering and exit codes remain unchanged. Operation registration observes the final iteration configuration,
so unchanged watch operations do not produce visible shadow registration or status events.

## Links

- [CHANGELOG.md](https://github.com/microsoft/rushstack/blob/main/libraries/reporter/CHANGELOG.md) - Find out
  what's new in the latest version
- [API Reference](https://api.rushstack.io/pages/reporter/)

`@rushstack/rush-reporter` is part of the [Rush Stack](https://rushstack.io/) family of projects.
