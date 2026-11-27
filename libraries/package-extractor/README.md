## @rushstack/package-extractor

A library used for creating an isolated copy of a package and, optionally, bundling it into an archive.

The `createArchiveFilePath` option supports ZIP (`.zip`), tar (`.tar`), and gzip-compressed
tar (`.tar.gz` or `.tgz`) archives, including when `createArchiveOnly` is enabled.
Tar archives require the native `tar` executable on PATH. Archive-only tar deployments
stage assets in a unique timestamp-based folder under `archiveTempFolder` (default:
`common/temp` under the source root), then remove that folder after success or failure.
ZIP archives continue
to use JavaScript; archive-only ZIP deployments stage only generated files and read existing
source files directly. Materialized deployments archive their target files without staging.
Generated assets are written once by the asset handler; the archive manager accepts only file paths.

`TarExecutable` shares memoized native discovery and execution with Rush's build cache.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/libraries/package-extractor/CHANGELOG.md) - Find
  out what's new in the latest version
- [API Reference](https://api.rushstack.io/pages/package-extractor/)

`@rushstack/package-extractor` is part of the [Rush Stack](https://rushstack.io/) family of projects.
