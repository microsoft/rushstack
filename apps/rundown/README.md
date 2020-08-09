# @rushstack/rundown

Slow startup times for Node.js commands or services?  **Rundown** can invoke a Node.js process and:

1. **View imported files:** Intercept all `require()` calls and show which paths were loaded.
2. **Find culprits:** Show the chain for `require()` calls for each import, explaining why it was imported.
3. **Detect regressions over time:** Generate a concise "snapshot" report that can be committed to Git.  Changes
   to this file may indicate potential performance regressions.


## Installation

You can install this tool globally:

```shell
$ npm install --global @rushstack/rundown

# View command line help
$ rundown --help
```

If you will generate rundown snapshots during your build, it is recommended to install via `devDependencies`:

```shell
$ cd my-tool
$ npm install @rushstack/rundown --save-dev
```


## Viewing imported files

Suppose you maintain a small NPM project that is invoked as follows:

```shell
# The folder where your tool is developed
$ cd my-tool

# When you invoke "my-tool --my-arg 123" from the shell, let's suppose that it invokes
# this Node.js command:
$ node lib/start.js --my-arg 123
```

And suppose that your tool's startup time is rather slow, because the code calls `require()` to load many different
NPM packages.  We can create a report to see all the imports:

```shell
# We use "--arg" to pass the command-line arguments for "my-tool"
$ rundown inspect --script lib/start.js --arg=--my-arg --arg=123
```

The report may look like this:

**rundown-inspect.log**
```
/path/to/my-tool/lib/start.js
/path/to/my-tool/node_modules/at-least-node/index.js
/path/to/my-tool/node_modules/fs-extra/lib/copy-sync/copy-sync.js
/path/to/my-tool/node_modules/fs-extra/lib/copy-sync/index.js
/path/to/my-tool/node_modules/fs-extra/lib/copy/copy.js
/path/to/my-tool/node_modules/fs-extra/lib/copy/index.js
/path/to/my-tool/node_modules/fs-extra/lib/empty/index.js
/path/to/my-tool/node_modules/fs-extra/lib/ensure/file.js
/path/to/my-tool/node_modules/fs-extra/lib/ensure/index.js
/path/to/my-tool/node_modules/fs-extra/lib/ensure/link.js
/path/to/my-tool/node_modules/fs-extra/lib/ensure/symlink-paths.js
/path/to/my-tool/node_modules/fs-extra/lib/ensure/symlink-type.js
/path/to/my-tool/node_modules/fs-extra/lib/ensure/symlink.js
/path/to/my-tool/node_modules/fs-extra/lib/fs/index.js
/path/to/my-tool/node_modules/fs-extra/lib/index.js
/path/to/my-tool/node_modules/fs-extra/lib/json/jsonfile.js
/path/to/my-tool/node_modules/fs-extra/lib/json/output-json-sync.js
/path/to/my-tool/node_modules/fs-extra/lib/json/output-json.js
/path/to/my-tool/node_modules/fs-extra/lib/mkdirs/index.js
/path/to/my-tool/node_modules/fs-extra/lib/mkdirs/make-dir.js
/path/to/my-tool/node_modules/fs-extra/lib/move-sync/index.js
/path/to/my-tool/node_modules/fs-extra/lib/move-sync/move-sync.js
/path/to/my-tool/node_modules/fs-extra/lib/move/index.js
/path/to/my-tool/node_modules/fs-extra/lib/move/move.js
/path/to/my-tool/node_modules/fs-extra/lib/output/index.js
/path/to/my-tool/node_modules/fs-extra/lib/path-exists/index.js
/path/to/my-tool/node_modules/fs-extra/lib/remove/index.js
/path/to/my-tool/node_modules/fs-extra/lib/remove/rimraf.js
/path/to/my-tool/node_modules/fs-extra/lib/util/stat.js
/path/to/my-tool/node_modules/fs-extra/lib/util/utimes.js
/path/to/my-tool/node_modules/graceful-fs/clone.js
/path/to/my-tool/node_modules/graceful-fs/graceful-fs.js
/path/to/my-tool/node_modules/graceful-fs/legacy-streams.js
/path/to/my-tool/node_modules/graceful-fs/polyfills.js
/path/to/my-tool/node_modules/jsonfile/index.js
/path/to/my-tool/node_modules/jsonfile/utils.js
/path/to/my-tool/node_modules/universalify/index.js
```

## Finding callers

To see how each file is imported, you can add the `--trace-imports` switch.
```shell
# We use "--arg" to pass the command-line arguments for "my-tool"
$ rundown inspect --script lib/start.js --arg=--my-arg --arg=123 --trace-imports
```

The report now shows more detail:

**rundown-inspect.log**
```
. . .
/path/to/my-tool/node_modules/graceful-fs/legacy-streams.js
  imported by /path/to/my-tool/node_modules/graceful-fs/graceful-fs.js
  imported by /path/to/my-tool/node_modules/fs-extra/lib/fs/index.js
  imported by /path/to/my-tool/node_modules/fs-extra/lib/index.js
  imported by /path/to/my-tool/lib/start.js
  imported by /rundown/lib/launcher.js

/path/to/my-tool/node_modules/graceful-fs/polyfills.js
  imported by /path/to/my-tool/node_modules/graceful-fs/graceful-fs.js
  imported by /path/to/my-tool/node_modules/fs-extra/lib/fs/index.js
  imported by /path/to/my-tool/node_modules/fs-extra/lib/index.js
  imported by /path/to/my-tool/lib/start.js
  imported by rundown/lib/launcher.js
. . .
```

## Fixing problems

It may be the case that many of these imports are not actually used.  You can avoid preloading them
by converting them to lazy imports using the `Import.lazy()` from
[@rushstack/node-core-library](https://www.npmjs.com/package/@rushstack/node-core-library)
or [import-lazy](https://www.npmjs.com/package/import-lazy).


## Generating a snapshot

To detect future regressions, use the `rundown snapshot` command to write a snapshot file:

```shell
# We use "--arg" to pass the command-line arguments for "my-tool"
$ rundown snapshot --script lib/start.js --arg=--my-arg --arg=123

# This file can be committed to Git to track regressions
$ git add rundown-snapshot.log
```

The snapshot file format eliminates spurious diffs, by showing only the names of the imported packages.
For local projects in a monorepo, it will show relative paths.  Example output:

**rundown-snapshot.log**
```
../path/to/monorepo-sibling
at-least-node
fs-extra
graceful-fs
jsonfile
universalify
```

## Command-line reference

```
usage: rundown [-h] <command> ...

Detect load time regressions by running an app, tracing require() calls, and
generating a deterministic report

Positional arguments:
  <command>
    snapshot  Invoke a Node.js script and generate a test snapshot
    inspect   Invoke a Node.js script and generate detailed diagnostic output

Optional arguments:
  -h, --help  Show this help message and exit.

For detailed help about a specific command, use: rundown <command> -h
```

```
usage: rundown snapshot [-h] -s PATH [-a STRING] [-q] [-i]

Invoke a Node.js script and generate a test snapshot. This command creates a
concise report that can be added to Git, so that its diff can be used to
detect performance regressions

Optional arguments:
  -h, --help            Show this help message and exit.
  -s PATH, --script PATH
                        The path to a .js file that will be the entry point
                        for the target Node.js process
  -a STRING, --arg STRING
                        Specifies command-line arguments to be passed to the
                        target Node.js process
  -q, --quiet           Suppress STDOUT/STDERR for the target Node.js process
  -i, --ignore-exit-code
                        Do not report an error if the target Node.js process
                        returns a nonzero exit code
```

```
usage: rundown inspect [-h] -s PATH [-a STRING] [-q] [-i] [-t]

Invoke a Node.js script and generate detailed diagnostic output. This command
is used to inspect performance regressions.

Optional arguments:
  -h, --help            Show this help message and exit.
  -s PATH, --script PATH
                        The path to a .js file that will be the entry point
                        for the target Node.js process
  -a STRING, --arg STRING
                        Specifies command-line arguments to be passed to the
                        target Node.js process
  -q, --quiet           Suppress STDOUT/STDERR for the target Node.js process
  -i, --ignore-exit-code
                        Do not report an error if the target Node.js process
                        returns a nonzero exit code
  -t, --trace-imports   Reports the call chain for each module path, showing
                        how it was imported
```
