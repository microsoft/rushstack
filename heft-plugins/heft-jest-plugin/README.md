# @rushstack/heft-jest-plugin

This is a Heft plugin for running Jest.

`lib/JestManagedWorkerQueue` provides lifecycle supervision for a single sequential `jest-worker`.
Await tasks through `waitForTaskAsync(task)` so failure observation ends when each task settles.
The class documents the remaining contract: no retries, idle-recycle readiness between tasks, and
explicit final-task/shutdown handling. Ordinary Jest execution does not use it or enable managed sharding.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/heft-plugins/heft-jest-plugin/CHANGELOG.md) - Find
  out what's new in the latest version
- [@rushstack/heft](https://www.npmjs.com/package/@rushstack/heft) - Heft is a config-driven toolchain that invokes popular tools such as TypeScript, ESLint, Jest, Webpack, and API Extractor.

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.
