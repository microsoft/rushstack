# @rushstack/heft-oxlint-plugin

This is a Heft plugin to run [oxlint](https://oxc.rs/docs/guide/usage/linter), the fast Rust-based
JavaScript/TypeScript linter from the Oxc project.

Unlike `@rushstack/heft-lint-plugin` (ESLint/TSLint), oxlint does not perform type-aware linting and
does not require a TypeScript program, so this plugin runs as a standalone task that invokes the
`oxlint` binary and reports its findings through the Heft logger.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/heft-plugins/heft-oxlint-plugin/CHANGELOG.md) - Find
  out what's new in the latest version
- [@rushstack/heft](https://www.npmjs.com/package/@rushstack/heft) - Heft is a config-driven toolchain that invokes popular tools such as TypeScript, ESLint, Jest, Webpack, and API Extractor.

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.
