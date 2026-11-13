# @rushstack/heft-jest-plugin

This is a Heft plugin for running Jest.

`@rushstack/heft-jest-plugin/lib/JestV8Coverage` provides raw V8 range validation and per-script compaction
for typed observations. Callers remain responsible for JSON validation, source identity and source-map
integrity. This utility does not enable sharding, collect coverage or convert coverage reports.
Coincident function spans require complete captures in V8 nesting order; sparse incremental captures are unsupported.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/heft-plugins/heft-jest-plugin/CHANGELOG.md) - Find
  out what's new in the latest version
- [@rushstack/heft](https://www.npmjs.com/package/@rushstack/heft) - Heft is a config-driven toolchain that invokes popular tools such as TypeScript, ESLint, Jest, Webpack, and API Extractor.

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.
