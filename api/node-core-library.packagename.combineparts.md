[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PackageName](./node-core-library.packagename.md) &gt; [combineParts](./node-core-library.packagename.combineparts.md)

## PackageName.combineParts() method

Combines an optional package scope with an unscoped root name.

<b>Signature:</b>

```typescript
static combineParts(scope: string, unscopedName: string): string;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  scope | `string` | Must be either an empty string, or a scope name such as "<!-- -->@<!-- -->example" |
|  unscopedName | `string` | Must be a nonempty package name that does not contain a scope |

<b>Returns:</b>

`string`

A full package name such as "<!-- -->@<!-- -->example/some-library".

