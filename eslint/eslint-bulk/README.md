# @rushstack/eslint-bulk

This is a companion package for @rushstack/eslint-patch that should be installed globally as follows:
```bash
npm i -g @rushstack/eslint-bulk
```

The **eslint-bulk** package is a set of command line tools to use with the ESLint bulk suppressions patch.
eslint-bulk commands must be run in the same current working directory containing your package's pertaining
.eslintrc.js or .eslintrc.cjs file.

## eslint-bulk suppress

Use this command to automatically generate bulk suppressions for the given files and given rules.
Supply the paths as the main argument. The paths argument is a glob pattern that follows the same
rules as the "files" argument in the "eslint" command.

```bash
eslint-bulk suppress --rule NAME1 [--rule NAME2...] PATH1 [PATH2...]
eslint-bulk suppress --all PATH1 [PATH2...]
```

## eslint-bulk prune

Use this command to automatically delete all unused suppression entries in all .eslint-bulk-suppressions.json
files under the current working directory.

```bash
eslint-bulk prune
```

# Links

- [CHANGELOG.md](https://github.com/microsoft/rushstack/blob/main/eslint/eslint-bulk/CHANGELOG.md) - Find
  out what's new in the latest version

`@rushstack/eslint-bulk` is part of the [Rush Stack](https://rushstack.io/) family of projects.
