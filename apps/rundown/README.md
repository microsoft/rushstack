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
/my-tool/lib/start.js
/my-tool/node_modules/at-least-node/index.js
/my-tool/node_modules/fs-extra/lib/copy-sync/copy-sync.js
/my-tool/node_modules/fs-extra/lib/copy-sync/index.js
/my-tool/node_modules/fs-extra/lib/copy/copy.js
/my-tool/node_modules/fs-extra/lib/copy/index.js
/my-tool/node_modules/fs-extra/lib/empty/index.js
/my-tool/node_modules/fs-extra/lib/ensure/file.js
/my-tool/node_modules/fs-extra/lib/ensure/index.js
/my-tool/node_modules/fs-extra/lib/ensure/link.js
/my-tool/node_modules/fs-extra/lib/ensure/symlink-paths.js
/my-tool/node_modules/fs-extra/lib/ensure/symlink-type.js
/my-tool/node_modules/fs-extra/lib/ensure/symlink.js
/my-tool/node_modules/fs-extra/lib/fs/index.js
/my-tool/node_modules/fs-extra/lib/index.js
/my-tool/node_modules/fs-extra/lib/json/jsonfile.js
/my-tool/node_modules/fs-extra/lib/json/output-json-sync.js
/my-tool/node_modules/fs-extra/lib/json/output-json.js
/my-tool/node_modules/fs-extra/lib/mkdirs/index.js
/my-tool/node_modules/fs-extra/lib/mkdirs/make-dir.js
/my-tool/node_modules/fs-extra/lib/move-sync/index.js
/my-tool/node_modules/fs-extra/lib/move-sync/move-sync.js
/my-tool/node_modules/fs-extra/lib/move/index.js
/my-tool/node_modules/fs-extra/lib/move/move.js
/my-tool/node_modules/fs-extra/lib/output/index.js
/my-tool/node_modules/fs-extra/lib/path-exists/index.js
/my-tool/node_modules/fs-extra/lib/remove/index.js
/my-tool/node_modules/fs-extra/lib/remove/rimraf.js
/my-tool/node_modules/fs-extra/lib/util/stat.js
/my-tool/node_modules/fs-extra/lib/util/utimes.js
/my-tool/node_modules/graceful-fs/clone.js
/my-tool/node_modules/graceful-fs/graceful-fs.js
/my-tool/node_modules/graceful-fs/legacy-streams.js
/my-tool/node_modules/graceful-fs/polyfills.js
/my-tool/node_modules/jsonfile/index.js
/my-tool/node_modules/jsonfile/utils.js
/my-tool/node_modules/universalify/index.js
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
C:\Git\rushstack\apps\test\node_modules\graceful-fs\legacy-streams.js
  imported by C:\Git\rushstack\apps\test\node_modules\graceful-fs\graceful-fs.js
  imported by C:\Git\rushstack\apps\test\node_modules\fs-extra\lib\fs\index.js
  imported by C:\Git\rushstack\apps\test\node_modules\fs-extra\lib\index.js
  imported by C:\Git\rushstack\apps\test\lib\start.js
  imported by C:\Git\rushstack\apps\rundown\lib\launcher.js

C:\Git\rushstack\apps\test\node_modules\graceful-fs\polyfills.js
  imported by C:\Git\rushstack\apps\test\node_modules\graceful-fs\graceful-fs.js
  imported by C:\Git\rushstack\apps\test\node_modules\fs-extra\lib\fs\index.js
  imported by C:\Git\rushstack\apps\test\node_modules\fs-extra\lib\index.js
  imported by C:\Git\rushstack\apps\test\lib\start.js
  imported by C:\Git\rushstack\apps\rundown\lib\launcher.js
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
