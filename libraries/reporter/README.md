# @rushstack/rush-reporter

Canonical event protocol, reporter manager, and built-in reporters for Rush.

This package is released as a public beta. Exported contracts may change before the stable release.

## Full-detail log completion

The frontend reports an invocation log as complete only after its accepted events and grouped
output have been persisted and the file has closed successfully. Its final `artifactAvailable`
notification is delivered to the remaining reporters after that close; it is not appended to the
same closed log. The log retains command results and session completion, including failed commands.
Flush or close failures leave the artifact incomplete or unavailable and produce an emergency warning
without replacing the command's native exit result.

## Links

- [CHANGELOG.md](https://github.com/microsoft/rushstack/blob/main/libraries/reporter/CHANGELOG.md) - Find out
  what's new in the latest version
- [API Reference](https://api.rushstack.io/pages/reporter/)

`@rushstack/rush-reporter` is part of the [Rush Stack](https://rushstack.io/) family of projects.
