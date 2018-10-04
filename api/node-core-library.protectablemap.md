[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [ProtectableMap](./node-core-library.protectablemap.md)

# ProtectableMap class

The ProtectableMap provides an easy way for an API to expose a `Map<K, V>` property while intercepting and validating any write operations that are performed by consumers of the API.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`protectedView`](./node-core-library.protectablemap.protectedview.md) |  | `Map<K, V>` | The owner of the protectable map should return this object via its public API. |
|  [`size`](./node-core-library.protectablemap.size.md) |  | `number` | Returns the number of (key, value) entries in the map. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`constructor(parameters)`](./node-core-library.protectablemap.constructor.md) |  |  | Constructs a new instance of the [ProtectableMap](./node-core-library.protectablemap.md) class |
|  [`clear()`](./node-core-library.protectablemap.clear.md) |  | `void` | Removes all entries from the map. This operation does NOT invoke the ProtectableMap onClear() hook. |
|  [`delete(key)`](./node-core-library.protectablemap.delete.md) |  | `boolean` | Removes the specified key from the map. This operation does NOT invoke the ProtectableMap onDelete() hook. |
|  [`forEach(callbackfn, thisArg)`](./node-core-library.protectablemap.foreach.md) |  | `void` | Performs an operation for each (key, value) entries in the map. |
|  [`get(key)`](./node-core-library.protectablemap.get.md) |  | `V | undefined` | Retrieves the value for the specified key. |
|  [`has(key)`](./node-core-library.protectablemap.has.md) |  | `boolean` | Returns true if the specified key belongs to the map. |
|  [`set(key, value)`](./node-core-library.protectablemap.set.md) |  | `this` | Sets a value for the specified key. This operation does NOT invoke the ProtectableMap onSet() hook. |

## Remarks

The ProtectableMap itself is intended to be a private object that only its owner can access directly. Any operations performed directly on the ProtectableMap will bypass the hooks and any validation they perform. The public property that is exposed to API consumers should return [ProtectableMap.protectedView](./node-core-library.protectablemap.protectedview.md) instead.

For example, suppose you want to share your `Map<string, number>` data structure, but you want to enforce that the key must always be an upper case string: You could use the onSet() hook to validate the keys and throw an exception if the key is not uppercase.
