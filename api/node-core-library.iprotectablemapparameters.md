[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IProtectableMapParameters](./node-core-library.iprotectablemapparameters.md)

## IProtectableMapParameters interface

Constructor parameters for [ProtectableMap](./node-core-library.protectablemap.md)

<b>Signature:</b>

```typescript
export interface IProtectableMapParameters<K, V> 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[onClear](./node-core-library.iprotectablemapparameters.onclear.md)</p> | <p>`(source: ProtectableMap<K, V>) => void`</p> | <p>An optional hook that will be invoked before Map.clear() is performed.</p> |
|  <p>[onDelete](./node-core-library.iprotectablemapparameters.ondelete.md)</p> | <p>`(source: ProtectableMap<K, V>, key: K) => void`</p> | <p>An optional hook that will be invoked before Map.delete() is performed.</p> |
|  <p>[onSet](./node-core-library.iprotectablemapparameters.onset.md)</p> | <p>`(source: ProtectableMap<K, V>, key: K, value: V) => V`</p> | <p>An optional hook that will be invoked before Map.set() is performed.</p> |

