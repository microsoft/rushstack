## @rushstack/package-extractor

A library used for creating an isolated copy of a package and, optionally, bundling it into an archive.

The `createArchiveFilePath` option supports ZIP (`.zip`), tar (`.tar`), and gzip-compressed
tar (`.tar.gz` or `.tgz`) archives, including when `createArchiveOnly` is enabled.
Tar archives require the native `tar` executable on PATH. Archive-only tar deployments
stage assets in a unique folder under `archiveTempFolder` (default: `common/temp` under
the source root), then remove that folder after success or failure. ZIP archives continue
to use JavaScript and do not require staging.

`TarExecutable` shares memoized native discovery and execution with Rush's build cache.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/libraries/deploy-manager/CHANGELOG.md) - Find
  out what's new in the latest version
- [API Reference](https://api.rushstack.io/pages/deploy-manager/)

`@rushstack/package-extractor` is part of the [Rush Stack](https://rushstack.io/) family of projects.
