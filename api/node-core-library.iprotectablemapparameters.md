[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IProtectableMapParameters](./node-core-library.iprotectablemapparameters.md)

## IProtectableMapParameters interface

Constructor parameters for [ProtectableMap](./node-core-library.protectablemap.md)

<b>Signature:</b>

```typescript
export interface IProtectableMapParameters<K, V> 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [onClear](./node-core-library.iprotectablemapparameters.onclear.md) | `(source: ProtectableMap<K, V>) => void` | An optional hook that will be invoked before Map.clear() is performed. |
|  [onDelete](./node-core-library.iprotectablemapparameters.ondelete.md) | `(source: ProtectableMap<K, V>, key: K) => void` | An optional hook that will be invoked before Map.delete() is performed. |
|  [onSet](./node-core-library.iprotectablemapparameters.onset.md) | `(source: ProtectableMap<K, V>, key: K, value: V) => V` | An optional hook that will be invoked before Map.set() is performed. |

