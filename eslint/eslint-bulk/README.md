# @rushstack/eslint-bulk

This package provides the command-line interface (CLI) for the **ESLint bulk suppressions**
feature from `@rushstack/eslint-patch`.

### Setting it up

👉 Before using this tool, you will first need to install and configure the
[@rushstack/eslint-patch](https://www.npmjs.com/package/@rushstack/eslint-patch) package.

See the [eslint-bulk-suppressions documentation](https://www.npmjs.com/package/@rushstack/eslint-patch#eslint-bulk-suppressions-feature)
for details.

### Typical workflow

1. Checkout your `main` branch, which is in a clean state where ESLint reports no violations.
2. Update your configuration to enable the latest lint rules; ESLint now reports thousands of legacy violations.
3. Run `eslint-bulk suppress --all ./src` to update **.eslint-bulk-suppressions.json.**
4. ESLint now no longer reports violations, so commit the results to Git and merge your pull request.
5. Over time, engineers may improve some of the suppressed code, in which case the associated suppressions are no longer needed.
6. Run `eslint-bulk prune` periodically to find and remove unnecessary suppressions from **.eslint-bulk-suppressions.json**, ensuring that new violations will now get caught in those scopes.

### "eslint-bulk suppress" command

```bash
eslint-bulk suppress --rule NAME1 [--rule NAME2...] PATH1 [PATH2...]
eslint-bulk suppress --all PATH1 [PATH2...]
```

Use this command to automatically generate bulk suppressions for the specified lint rules and file paths.
The path argument is a [glob pattern](https://en.wikipedia.org/wiki/Glob_(programming)) with the same syntax
as path arguments for the `eslint` command.


### "eslint-bulk prune" command

Use this command to automatically delete all unnecessary suppression entries in all
**.eslint-bulk-suppressions.json** files under the current working directory.

```bash
eslint-bulk prune
```

# Links

- [CHANGELOG.md](https://github.com/microsoft/rushstack/blob/main/eslint/eslint-bulk/CHANGELOG.md) - Find
  out what's new in the latest version

- [`@rushstack/eslint-patch`](https://www.npmjs.com/package/@rushstack/eslint-patch) required companion package


`@rushstack/eslint-bulk` is part of the [Rush Stack](https://rushstack.io/) family of projects.
