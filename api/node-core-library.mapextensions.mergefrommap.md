[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [MapExtensions](./node-core-library.mapextensions.md) &gt; [mergeFromMap](./node-core-library.mapextensions.mergefrommap.md)

## MapExtensions.mergeFromMap() method

Adds all the (key, value) pairs from the source map into the target map.

<b>Signature:</b>

```typescript
static mergeFromMap<K, V>(targetMap: Map<K, V>, sourceMap: ReadonlyMap<K, V>): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>targetMap</p> | <p>`Map<K, V>`</p> | <p>The map that entries will be added to</p> |
|  <p>sourceMap</p> | <p>`ReadonlyMap<K, V>`</p> | <p>The map containing the entries to be added</p> |

<b>Returns:</b>

`void`

## Remarks

This function modifies targetMap. Any existing keys will be overwritten.

