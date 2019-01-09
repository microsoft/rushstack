[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [ProtectableMap](./node-core-library.protectablemap.md)

## ProtectableMap class

The ProtectableMap provides an easy way for an API to expose a `Map<K, V>` property while intercepting and validating any write operations that are performed by consumers of the API.

<b>Signature:</b>

```typescript
export declare class ProtectableMap<K, V> 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[protectedView](./node-core-library.protectablemap.protectedview.md)</p> |  | <p>`Map<K, V>`</p> | <p>The owner of the protectable map should return this object via its public API.</p> |
|  <p>[size](./node-core-library.protectablemap.size.md)</p> |  | <p>`number`</p> | <p>Returns the number of (key, value) entries in the map.</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[clear()](./node-core-library.protectablemap.clear.md)</p> |  | <p>Removes all entries from the map. This operation does NOT invoke the ProtectableMap onClear() hook.</p> |
|  <p>[delete(key)](./node-core-library.protectablemap.delete.md)</p> |  | <p>Removes the specified key from the map. This operation does NOT invoke the ProtectableMap onDelete() hook.</p> |
|  <p>[forEach(callbackfn, thisArg)](./node-core-library.protectablemap.foreach.md)</p> |  | <p>Performs an operation for each (key, value) entries in the map.</p> |
|  <p>[get(key)](./node-core-library.protectablemap.get.md)</p> |  | <p>Retrieves the value for the specified key.</p> |
|  <p>[has(key)](./node-core-library.protectablemap.has.md)</p> |  | <p>Returns true if the specified key belongs to the map.</p> |
|  <p>[set(key, value)](./node-core-library.protectablemap.set.md)</p> |  | <p>Sets a value for the specified key. This operation does NOT invoke the ProtectableMap onSet() hook.</p> |

## Remarks

The ProtectableMap itself is intended to be a private object that only its owner can access directly. Any operations performed directly on the ProtectableMap will bypass the hooks and any validation they perform. The public property that is exposed to API consumers should return [ProtectableMap.protectedView](./node-core-library.protectablemap.protectedview.md) instead.

For example, suppose you want to share your `Map<string, number>` data structure, but you want to enforce that the key must always be an upper case string: You could use the onSet() hook to validate the keys and throw an exception if the key is not uppercase.

