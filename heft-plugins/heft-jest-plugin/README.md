# @rushstack/heft-jest-plugin

This is a Heft plugin for running Jest.

Portable Istanbul-format coverage maps support future managed Babel coverage aggregation across Jest shards.
The helper makes paths build-root-relative and source-map end-of-line locations JSON-safe without changing counters.
It does not enable sharding, instrument code, or merge raw V8 coverage.
Heft still defaults to V8; raw V8 transport does not require this helper.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/heft-plugins/heft-jest-plugin/CHANGELOG.md) - Find
  out what's new in the latest version
- [@rushstack/heft](https://www.npmjs.com/package/@rushstack/heft) - Heft is a config-driven toolchain that invokes popular tools such as TypeScript, ESLint, Jest, Webpack, and API Extractor.

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.
