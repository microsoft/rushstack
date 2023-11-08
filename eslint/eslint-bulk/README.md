# @rushstack/eslint-bulk

This is a companion package for @rushstack/eslint-patch.

The **eslint-bulk** package is a set of command line tools to use with the ESLint bulk suppressions
patch. The commands are optional as they are just a thin wrapper over eslint shipped with the correct
environment variables to interface with the patch.

## eslint-bulk suppress

Use this command to automatically generate bulk suppressions for the given files and given rules.
Supply the files as the main argument. The "files" argument is a glob pattern that follows the same
rules as the "eslint" command.

```bash
  eslint-bulk suppress path/to/file1 path/to/file2 path/to/directory --rule rule1 --rule rule2
```

## eslint-bulk cleanup

Use this command to automatically delete unused suppression entries for the given files in the
corresponding .eslint-bulk-suppressions.json file(s). Supply the files as the main argument. The
"files" argument is a glob pattern that follows the same rules as the "eslint" command.

```bash
  eslint-bulk cleanup path/to/file1 path/to/file2 path/to/directory
```

# Links

- [CHANGELOG.md](https://github.com/microsoft/rushstack/blob/main/eslint/eslint-bulk/CHANGELOG.md) - Find
  out what's new in the latest version

`@rushstack/eslint-bulk` is part of the [Rush Stack](https://rushstack.io/) family of projects.
