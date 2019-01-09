[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiModel](./api-extractor.apimodel.md) &gt; [tryGetPackageByName](./api-extractor.apimodel.trygetpackagebyname.md)

## ApiModel.tryGetPackageByName() method

Efficiently finds a package by the NPM package name.

<b>Signature:</b>

```typescript
tryGetPackageByName(packageName: string): ApiPackage | undefined;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  packageName | `string` |  |

<b>Returns:</b>

`ApiPackage | undefined`

## Remarks

If the NPM scope is omitted in the package name, it will still be found provided that it is an unambiguous match. For example, it's often convenient to write `{@link node-core-library#JsonFile}` instead of `{@link @microsoft/node-core-library#JsonFile}`<!-- -->.

