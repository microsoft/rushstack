[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PackageName](./node-core-library.packagename.md) &gt; [combineParts](./node-core-library.packagename.combineparts.md)

## PackageName.combineParts() method

Combines an optional package scope with an unscoped root name.

<b>Signature:</b>

```typescript
static combineParts(scope: string, unscopedName: string): string;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>scope</p> | <p>`string`</p> | <p>Must be either an empty string, or a scope name such as "<!-- -->@<!-- -->example"</p> |
|  <p>unscopedName</p> | <p>`string`</p> | <p>Must be a nonempty package name that does not contain a scope</p> |

<b>Returns:</b>

`string`

A full package name such as "<!-- -->@<!-- -->example/some-library".

