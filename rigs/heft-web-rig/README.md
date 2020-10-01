## @rushstack/heft-web-rig

A rig package for web projects that build using [Heft](https://www.npmjs.com/package/@rushstack/heft)
build system.  To learn more about rig packages, consult the
[@rushstack/rig-package](https://www.npmjs.com/package/@rushstack/rig-package) documentation.

This rig contains a single profile: `library`

To enable it, add a **rig.json** file to your project, as shown below:

**config/rig.json**
```js
{
  "$schema": "https://developer.microsoft.com/json-schemas/rig-package/rig.schema.json",

  "rigPackageName": "@rushstack/heft-web-rig",
  "rigProfile": "library"
}
```

The config files provided by this rig profile can be found in the [heft-web-rig/profiles/library](
https://github.com/microsoft/rushstack/tree/master/rigs/heft-web-rig/profiles/library) source folder.


## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/master/rigs/heft-web-rig/CHANGELOG.md) - Find
  out what's new in the latest version

`@rushstack/heft-web-rig` is part of the [Rush Stack](https://rushstack.io/) family of projects.
