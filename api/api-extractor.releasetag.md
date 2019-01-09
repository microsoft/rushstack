[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ReleaseTag](./api-extractor.releasetag.md)

## ReleaseTag enum

A "release tag" is a custom TSDoc tag that is applied to an API to communicate the level of support provided for third-party developers.

<b>Signature:</b>

```typescript
export declare enum ReleaseTag 
```

## Enumeration Members

|  Member | Value | Description |
|  --- | --- | --- |
|  Alpha | `2` | Indicates that an API item is eventually intended to be public, but currently is in an early stage of development. Third parties should not use "alpha" APIs. |
|  Beta | `3` | Indicates that an API item has been released in an experimental state. Third parties are encouraged to try it and provide feedback. However, a "beta" API should NOT be used in production. |
|  Internal | `1` | Indicates that an API item is meant only for usage by other NPM packages from the same maintainer. Third parties should never use "internal" APIs. (To emphasize this, their names are prefixed by underscores.) |
|  None | `0` | No release tag was specified in the AEDoc summary. |
|  Public | `4` | Indicates that an API item has been officially released. It is part of the supported contract (e.g. SemVer) for a package. |

## Remarks

The four release tags are: `@internal`<!-- -->, `@alpha`<!-- -->, `@beta`<!-- -->, and `@public`<!-- -->. They are applied to API items such as classes, member functions, enums, etc. The release tag applies recursively to members of a container (e.g. class or interface). For example, if a class is marked as `@beta`<!-- -->, then all of its members automatically have this status; you DON'T need add the `@beta` tag to each member function. However, you could add `@internal` to a member function to give it a different release status.

