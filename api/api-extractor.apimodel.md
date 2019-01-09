[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiModel](./api-extractor.apimodel.md)

## ApiModel class

A serializable representation of a collection of API declarations.

<b>Signature:</b>

```typescript
export declare class ApiModel extends ApiModel_base 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [canonicalReference](./api-extractor.apimodel.canonicalreference.md) |  | `string` |  |
|  [kind](./api-extractor.apimodel.kind.md) |  | `ApiItemKind` |  |
|  [packages](./api-extractor.apimodel.packages.md) |  | `ReadonlyArray<ApiPackage>` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [addMember(member)](./api-extractor.apimodel.addmember.md) |  |  |
|  [loadPackage(apiJsonFilename)](./api-extractor.apimodel.loadpackage.md) |  |  |
|  [resolveDeclarationReference(declarationReference, contextApiItem)](./api-extractor.apimodel.resolvedeclarationreference.md) |  |  |
|  [tryGetPackageByName(packageName)](./api-extractor.apimodel.trygetpackagebyname.md) |  | Efficiently finds a package by the NPM package name. |

## Remarks

An `ApiModel` represents a collection of API declarations that can be serialized to disk. It captures all the important information needed to generate documentation, without any reliance on the TypeScript compiler engine.

An `ApiModel` acts as the root of a tree of objects that all inherit from the `ApiItem` base class. The tree children are determined by the  mixin base class. The model contains packages. Packages have an entry point (today, only one). And the entry point can contain various types of API declarations. The container relationships might look like this:

```
Things that can contain other things:

- ApiModel
  - ApiPackage
    - ApiEntryPoint
      - ApiClass
        - ApiMethod
        - ApiProperty
      - ApiEnum
        - ApiEnumMember
      - ApiInterface
        - ApiMethodSignature
        - ApiPropertySignature
      - ApiNamespace
        - (ApiClass, ApiEnum, ApiInterace, ...)


```
Normally, API Extractor writes an .api.json file to disk for each project that it builds. Then, a tool like API Documenter can load the various `ApiPackage` objects into a single `ApiModel` and process them as a group. This is useful because compilation generally occurs separately (e.g. because projects may reside in different Git repos, or because they build with different TypeScript compiler configurations that may be incompatible), whereas API Documenter cannot detect broken hyperlinks without seeing the entire documentation set.

