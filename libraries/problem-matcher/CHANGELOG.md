# Change Log - @rushstack/problem-matcher

This log was last generated on Thu, 19 Feb 2026 00:04:53 GMT and should not be manually modified.

## 0.2.0
Thu, 19 Feb 2026 00:04:53 GMT

### Minor changes

- Normalize package layout. CommonJS is now under `lib-commonjs`, DTS is now under `lib-dts`, and ESM is now under `lib-esm`. Imports to `lib` still work as before, handled by the `"exports"` field in `package.json`.

## 0.1.1
Tue, 30 Sep 2025 23:57:45 GMT

### Patches

- Fix multi-line looping problem matcher message parsing

## 0.1.0
Tue, 30 Sep 2025 20:33:51 GMT

### Minor changes

- Add @rushstack/problem-matcher library to parse and use VS Code style problem matchers

