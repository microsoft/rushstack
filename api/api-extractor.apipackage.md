[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiPackage](./api-extractor.apipackage.md)

## ApiPackage class

Represents an NPM package containing API declarations.

<b>Signature:</b>

```typescript
export declare class ApiPackage extends ApiPackage_base 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [canonicalReference](./api-extractor.apipackage.canonicalreference.md) |  | `string` |  |
|  [entryPoints](./api-extractor.apipackage.entrypoints.md) |  | `ReadonlyArray<ApiEntryPoint>` |  |
|  [kind](./api-extractor.apipackage.kind.md) |  | `ApiItemKind` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [addMember(member)](./api-extractor.apipackage.addmember.md) |  |  |
|  [findEntryPointsByPath(importPath)](./api-extractor.apipackage.findentrypointsbypath.md) |  |  |
|  [loadFromJsonFile(apiJsonFilename)](./api-extractor.apipackage.loadfromjsonfile.md) | `static` |  |
|  [saveToJsonFile(apiJsonFilename, options)](./api-extractor.apipackage.savetojsonfile.md) |  |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

