# @rushstack/storybook-telemetry-stub

A stub replacement of `@storybook/telemetry` for use in environments that absolutely forbid outbound
network connections and want to ensure that Storybook doesn't probe outside of its project folder,
e.g. for discovering what kind of package manager the repository uses.

All exported names mirror those of the official `@storybook/telemetry` package, but every function
is a no-op and every object is an empty stand-in.

## Links

- [CHANGELOG.md](./CHANGELOG.md) - Find out what's new in the latest version

`@rushstack/storybook-telemetry-stub` is part of the [Rush Stack](https://rushstack.io/) family of projects.
