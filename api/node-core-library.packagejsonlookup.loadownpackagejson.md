[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PackageJsonLookup](./node-core-library.packagejsonlookup.md) &gt; [loadOwnPackageJson](./node-core-library.packagejsonlookup.loadownpackagejson.md)

## PackageJsonLookup.loadOwnPackageJson() method

A helper for loading the caller's own package.json file.

<b>Signature:</b>

```typescript
static loadOwnPackageJson(dirnameOfCaller: string): IPackageJson;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>dirnameOfCaller</p> | <p>`string`</p> | <p>The NodeJS `__dirname` macro for the caller.</p> |

<b>Returns:</b>

`IPackageJson`

This function always returns a valid `IPackageJson` object. If any problems are encountered during loading, an exception will be thrown instead.

## Remarks

This function provides a concise and efficient way for an NPM package to report metadata about itself. For example, a tool might want to report its version.

The `loadOwnPackageJson()` probes upwards from the caller's folder, expecting to find a package.json file, which is assumed to be the caller's package. The result is cached, under the assumption that a tool's own package.json (and intermediary folders) will never change during the lifetime of the process.

## Example


```ts
// Report the version of our NPM package
const myPackageVersion: string = PackageJsonLookup.loadOwnPackageJson(__dirname).version;
console.log(`Cool Tool - Version ${myPackageVersion}`);

```

