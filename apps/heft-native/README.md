# heft-native

A self-contained, std-only Rust implementation of the `heft` command line. It is an experiment: it is
**opt-in**, it is not a Rush project (there is no `package.json` here), and nothing else in the repository
depends on it. `rush install` and `rush build` never look at this folder and work without Cargo.

## Building

```bash
cd apps/heft-native
cargo build --release
```

The binary is written to `apps/heft-native/target/release/heft` (`target/` is ignored by Git). The crate has
no dependencies; `Cargo.lock` only lists `heft-native` itself.

## Using it

Run the binary instead of `heft` from a project folder:

```bash
cd build-tests/heft-node-everything-test
../../apps/heft-native/target/release/heft build --help
```

The binary implements `@rushstack/heft` of the version in `Cargo.toml` (kept equal to `apps/heft/package.json` by
a unit test). It first makes the same decision as Heft's JavaScript version selector
(`lib-commonjs/startWithVersionSelector.js`): with `--unmanaged`, outside of any project, or when the project's
`package.json` has no `@rushstack/heft` dependency, it runs itself; when the project's
`node_modules/@rushstack/heft` is the binary's own JavaScript companion (the same folder, for example through a
workspace or pnpm link) with the `lib-commonjs` layout, it runs itself too. In every other case (an older or newer
local Heft, a copy of the same version in another folder such as a patched or linked package, the legacy `lib/`
layout, a missing entry point, a `package.json` that `JSON.parse()` rejects, a companion of another version) it
prints nothing and delegates the whole invocation to its JavaScript companion, whose version selector then behaves
exactly like before.

Whatever the binary does not handle natively is delegated the same way: `node <companion>/bin/heft <arguments>`.
The companion is the `@rushstack/heft` package that belongs to the binary, found in this order:

1. `HEFT_NATIVE_JS_BIN`: the path of a Heft `bin/heft` script
2. next to the executable: `apps/heft-native/target/<profile>/heft` uses `apps/heft/bin/heft` of the same
   checkout, and a future `@rushstack/<platform package>/bin/heft` uses `@rushstack/heft/bin/heft` next to it
3. `<project>/node_modules/@rushstack/heft/bin/heft`

## What runs without Node.js

- Help, usage and command line errors (`--help`, `<action> --help`, `--version`, unknown actions or parameters,
  unknown phases, "No phases were selected") are printed by the binary itself.
- `heft clean` runs natively for any project: it deletes `temp/<phase>/<task>` and the `cleanFiles` of the
  selected phases and prints Heft's summary.
- A build runs natively when every task of the project is a `copy-files-plugin`, `delete-files-plugin` or
  `set-environment-variables-plugin` task of `@rushstack/heft`, there are no lifecycle plugins, and the selected
  phases and tasks form a single chain (so the output order does not depend on timing). The binary produces the
  same output, exit code, copied files and `file-copy.json` incremental state as the JavaScript Heft.
- It does so only when standard input is the null device (as for builds started by Rush) and without `--watch`,
  `--verbose` or `--debug`, and only for glob patterns of the forms `**/*`, `*`, `**/*.ext`, `**/*.{a,b}`,
  `name.*` and literal paths without `excludeGlobs`. Symbolic links, unusual file names, files outside those
  patterns or a `file-copy.json` that is not plain JSON make it hand the invocation to the JavaScript Heft before
  anything is printed.
- If standard output is closed while it writes (`heft build | head`), it stops where Heft would stop and lets
  `node` report the error exactly like Heft does.

## Plugin host

Invocations that need JavaScript plugins run in the plugin host of the selected Heft package
(`node <heft>/lib-commonjs/host/HostEntry.js --heft-plan-fd=<n>`). The binary writes the plan to an unnamed
temporary file (`O_TMPFILE` in `$XDG_RUNTIME_DIR`, `$TMPDIR`, `/dev/shm` or `/tmp`), which `node` inherits and
the host reads and closes before any plugin is loaded; nothing is added to the environment or left on disk. On
Unix the binary replaces itself with `node` (`exec`), so signals, exit codes and memory use are the ones of the
JavaScript Heft; on other platforms it runs `node` and waits for it (only Linux is tested). `node` is looked up
in `PATH`, like `#!/usr/bin/env node` does.

## Warm plugin host (opt-in)

With `HEFT_WARM_HOST=1`, plugin-host runs whose standard input is the null device and whose standard output and
error are not terminals (for example builds started by Rush) are sent to a pre-warmed Node.js host over a Unix
domain socket in `$XDG_RUNTIME_DIR/heft-host-<uid>` (or `/tmp/heft-host-<uid>`). The folder must be a real
directory owned by the user with mode `0700`; otherwise the warm host is not used. The host's output is streamed
back and the binary exits with the host's exit code; Ctrl+C and `SIGTERM` are forwarded.

Each host serves one run and then starts its successor; a host exits after `HEFT_WARM_HOST_IDLE_MS` milliseconds
without a run. Any mismatch (Heft or Node.js version, environment, umask, changed Heft files, Rush reporter or IPC
file descriptors) makes the host refuse and the binary run cold. When no host accepts the run, the binary runs
cold as usual and starts a host (`lib-commonjs/host/WarmHostEntry.js`) in the background for the next run, unless
four hosts are already running for the user.

## Static build (optional)

`cargo build --release --target x86_64-unknown-linux-musl` (after `rustup target add x86_64-unknown-linux-musl`)
produces a statically linked binary in `target/x86_64-unknown-linux-musl/release/heft`. It is about as fast as the
default build and uses less memory (about 1 MB instead of 2.8 MB peak for a native build), but it is about 90 KB
larger.

## Layout

Each folder under `src/` is a module with a single owner:

| Module | Responsibility |
| --- | --- |
| `json`, `schema`, `regex` | JSONC parsing, JSON schema validation, the regular expression subset used by schemas |
| `cli` | command line model, parsing, help and error rendering |
| `config` | `heft.json`, rigs, `heft-plugin.json`, plugin options, package resolution |
| `graph`, `run`, `builtin`, `terminal` | phase and task graph, execution, native built-in plugins, terminal output |
| `sys` | the only place with `unsafe` code (minimal operating system calls) |
| `process`, `version`, `host_link` | running Node.js, selecting the Heft version, the connection to the JavaScript plugin host |

The code follows these rules: only the Rust standard library, `#![deny(unsafe_code)]` outside `src/sys`, no
comments in the code, source files of at most 200 lines, and a stripped release binary of at most 1 MB.
