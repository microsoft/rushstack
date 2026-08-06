# @rushstack/heft-test-evaluator-plugin

This is a Heft plugin for evaluating test and code coverage artifacts.

## Split test/evaluate phases

To opt into a cache-friendly split-phase flow:

1. Run Jest in record-only mode (`--record-only`) in `_phase:test` so failures are written to artifacts.
2. Run a separate evaluator task in `_phase:test-evaluate` to apply failure policy from JUnit/Cobertura artifacts.
3. In CI, run `_phase:test` first and then `_phase:test-evaluate`.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/heft-plugins/heft-test-evaluator-plugin/CHANGELOG.md) - Find
  out what's new in the latest version
- [@rushstack/heft](https://www.npmjs.com/package/@rushstack/heft) - Heft is a config-driven toolchain that invokes popular tools such as TypeScript, ESLint, Jest, Webpack, and API Extractor.

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.
