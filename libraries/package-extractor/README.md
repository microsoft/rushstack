## @rushstack/package-extractor

A library used for creating an isolated copy of a package and, optionally, bundling it into an archive.

The `createArchiveFilePath` option supports ZIP (`.zip`), tar (`.tar`), and gzip-compressed
tar (`.tar.gz` or `.tgz`) archives, including when `createArchiveOnly` is enabled.
Tar archives use the native `tar` executable when the deployed files are available on disk,
falling back to JavaScript when it is unavailable or fails. Archive-only deployments use
JavaScript so generated assets do not need to be staged on disk.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/libraries/deploy-manager/CHANGELOG.md) - Find
  out what's new in the latest version
- [API Reference](https://api.rushstack.io/pages/deploy-manager/)

`@rushstack/package-extractor` is part of the [Rush Stack](https://rushstack.io/) family of projects.
