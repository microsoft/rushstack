# @rushstack/heft-cargo-plugin

This is a Heft plugin for integrating Cargo (Rust's package manager and build tool) with Heft.

## Available Plugins

### cargo-test-plugin

Runs `cargo test` to execute Rust tests.

**Configuration file:** `config/cargo-test.json`

**Options:**
- `release` - Run in release mode
- `workspace` - Run tests for all packages in the workspace

**CLI Parameters:**
- `--release` - Run cargo test in release mode
- `--workspace` - Run tests for all packages in the workspace

### cargo-build-plugin

Runs `cargo build` to compile Rust code.

**Configuration file:** `config/cargo-build.json`

**Options:**
- `release` - Build in release mode
- `workspace` - Build all packages in the workspace

**CLI Parameters:**
- `--release` - Run cargo build in release mode
- `--workspace` - Build all packages in the workspace

### cargo-clippy-plugin

Runs `cargo clippy` for Rust linting.

**Configuration file:** `config/cargo-clippy.json`

**Options:**
- `release` - Run in release mode
- `workspace` - Run clippy for all packages in the workspace
- `fix` - Automatically apply suggested fixes
- `warningsAsErrors` - Treat warnings as errors

**CLI Parameters:**
- `--release` - Run cargo clippy in release mode
- `--workspace` - Run clippy for all packages in the workspace
- `--fix` - Automatically apply suggested fixes
- `--warnings-as-errors` - Treat warnings as errors

### cargo-fmt-plugin

Runs `cargo fmt` for Rust code formatting.

**Configuration file:** `config/cargo-fmt.json`

**Options:**
- `workspace` - Format all packages in the workspace
- `check` - Run in check mode (no files will be modified)

**CLI Parameters:**
- `--workspace` - Format all packages in the workspace
- `--check` - Run in check mode (no files will be modified)

### cargo-lint-plugin

A combined linting plugin that runs both `cargo fmt --check` and `cargo clippy`.

**Configuration file:** `config/cargo-lint.json`

**Options:**
- `release` - Run cargo clippy in release mode
- `workspace` - Lint all packages in the workspace
- `warningsAsErrors` - Treat clippy warnings as errors
- `skipFmt` - Skip the cargo fmt check step
- `skipClippy` - Skip the cargo clippy step

**CLI Parameters:**
- `--release` - Run cargo clippy in release mode
- `--workspace` - Lint all packages in the workspace
- `--warnings-as-errors` - Treat clippy warnings as errors
- `--skip-fmt` - Skip the cargo fmt check step
- `--skip-clippy` - Skip the cargo clippy step

## Usage Example

In your `config/heft.json`:

```json
{
  "phasesByName": {
    "build": {
      "tasksByName": {
        "cargo-build": {
          "taskPlugin": {
            "pluginPackage": "@rushstack/heft-cargo-plugin",
            "pluginName": "cargo-build-plugin"
          }
        }
      }
    },
    "test": {
      "tasksByName": {
        "cargo-test": {
          "taskPlugin": {
            "pluginPackage": "@rushstack/heft-cargo-plugin",
            "pluginName": "cargo-test-plugin"
          }
        }
      }
    },
    "lint": {
      "tasksByName": {
        "cargo-lint": {
          "taskPlugin": {
            "pluginPackage": "@rushstack/heft-cargo-plugin",
            "pluginName": "cargo-lint-plugin"
          }
        }
      }
    }
  }
}
```

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/heft-plugins/heft-cargo-plugin/CHANGELOG.md) - Find
  out what's new in the latest version
- [@rushstack/heft](https://www.npmjs.com/package/@rushstack/heft) - Heft is a config-driven toolchain that invokes popular tools such as TypeScript, ESLint, Jest, Webpack, and API Extractor.

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.
