[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [MapExtensions](./node-core-library.mapextensions.md) &gt; [mergeFromMap](./node-core-library.mapextensions.mergefrommap.md)

# MapExtensions.mergeFromMap method

Adds all the (key, value) pairs from the source map into the target map.

**Signature:**
```javascript
static mergeFromMap<K, V>(targetMap: Map<K, V>, sourceMap: Map<K, V>): void;
```
**Returns:** `void`

## Remarks

This function modifies targetMap. Any existing keys will be overwritten.

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `targetMap` | `Map<K, V>` | The map that entries will be added to |
|  `sourceMap` | `Map<K, V>` | The map containing the entries to be added |

