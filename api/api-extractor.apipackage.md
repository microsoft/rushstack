[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiPackage](./api-extractor.apipackage.md)

## ApiPackage class

Represents an NPM package containing API declarations.

<b>Signature:</b>

```typescript
export declare class ApiPackage extends ApiPackage_base 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[canonicalReference](./api-extractor.apipackage.canonicalreference.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[entryPoints](./api-extractor.apipackage.entrypoints.md)</p> |  | <p>`ReadonlyArray<ApiEntryPoint>`</p> |  |
|  <p>[kind](./api-extractor.apipackage.kind.md)</p> |  | <p>`ApiItemKind`</p> | <p></p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[addMember(member)](./api-extractor.apipackage.addmember.md)</p> |  | <p></p> |
|  <p>[findEntryPointsByPath(importPath)](./api-extractor.apipackage.findentrypointsbypath.md)</p> |  |  |
|  <p>[loadFromJsonFile(apiJsonFilename)](./api-extractor.apipackage.loadfromjsonfile.md)</p> | <p>`static`</p> |  |
|  <p>[saveToJsonFile(apiJsonFilename, options)](./api-extractor.apipackage.savetojsonfile.md)</p> |  |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

