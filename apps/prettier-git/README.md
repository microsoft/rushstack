# @rushstack/prettier-git

Wrapper for [Prettier](https://prettier.io/) that supports efficient operation in a Git repository to format only files that have changed since a specified revision, and for use as a pre-commit hook.
When used as a pre-commit hook, it will only format staged files, and the changes will be written directly to the Git index (where staged files are stored).
If a file is fully staged (there are staged changes, but no unstaged changes), after formatting, the formatted file will be checked out from the index to the working tree.
If a file is partially staged (there are both staged and unstaged changes), this will not occur. This means that the diff between the index and the working tree will show the changes performed by Prettier, in addition to any other local changes.

## Usage

As a Git pre-commit hook
`npx @rushstack/prettier-git --quiet || exit $?`

For CI Validation
`npx @rushstack/prettier-git --check --since REVISION`
where `REVISION` is the merge-base with the trunk. In environments that use a single merge commit, this is `HEAD~1`.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/apps/prettier-git/CHANGELOG.md) - Find
  out what's new in the latest version

Rundown is part of the [Rush Stack](https://rushstack.io/) family of projects.
