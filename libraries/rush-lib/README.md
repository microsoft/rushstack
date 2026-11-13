## @microsoft/rush-lib

This is a companion package for the Rush tool.  See the
[@microsoft/rush](https://www.npmjs.com/package/@microsoft/rush)
package for details.

The **rush-lib** package implements the rush.json config file loader
and some other helpful utilities.  Tools that want to reuse this
functionality can install **rush-lib** alone to avoid inadvertently
adding another "rush" executable to the command-line path (which
might interfere with the globally installed Rush).

The **@microsoft/rush** version number is always exactly equal
to the **@microsoft/rush-lib** version number that it depends on.

API documentation for this package: https://rushjs.io/pages/advanced/api/

## Reconciling an autoinstaller manifest

`rush update-autoinstaller --name tools` deletes the existing lockfile and performs
a full update, as before. For PNPM, opt into using the existing lockfile instead:

```sh
rush update-autoinstaller --name tools --preserve-lockfile
```

This requires an existing lockfile and runs `pnpm install --no-frozen-lockfile`,
allowing manifest changes to be resolved even in CI. It does not freeze dependency
versions: PNPM can still change resolutions, including transitive dependencies,
when reconciling the dependency graph. Review the resulting lockfile diff.
The option does not change lifecycle-script, hook, or registry configuration.
NPM and Yarn are not supported by this option.

The `Autoinstaller.pnpm.test.ts` Heft test uses a loopback registry and the
repository's installed PNPM. Set `PNPM_TEST_EXECUTABLE` to another PNPM executable
to exercise the same fixture against other versions without changing `rush.json`.
The fixture supplies an isolated child-process environment and project-local
configuration and caches; CI package-manager settings are not inherited.

## Links

- [Experimental environment variables](../../docs/rush/environment-variables.md) - Daemon opt-in,
  resource policy, reporter selection, defaults and precedence for the upcoming release
- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/apps/rush/CHANGELOG.md) - Find
  out what's new in the latest version
- [API Reference](https://api.rushstack.io/pages/rush-lib/)

Rush is part of the [Rush Stack](https://rushstack.io/) family of projects.
