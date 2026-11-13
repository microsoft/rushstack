# @rushstack/heft-jest-plugin

This is a Heft plugin for running Jest.

## JUnit serialization utility

`lib/JestJUnitReporting` serializes validated Jest results to XML without writing reports or changing Jest execution.
Callers supply canonical ordering, consistent results, and finite nonnegative assertion durations; legacy test files
without assertion details are rejected. This utility alone does not enable sharding or JUnit report publication.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/heft-plugins/heft-jest-plugin/CHANGELOG.md) - Find
  out what's new in the latest version
- [@rushstack/heft](https://www.npmjs.com/package/@rushstack/heft) - Heft is a config-driven toolchain that invokes popular tools such as TypeScript, ESLint, Jest, Webpack, and API Extractor.

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.
