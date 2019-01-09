[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IProtectableMapParameters](./node-core-library.iprotectablemapparameters.md) &gt; [onDelete](./node-core-library.iprotectablemapparameters.ondelete.md)

## IProtectableMapParameters.onDelete property

An optional hook that will be invoked before Map.delete() is performed.

<b>Signature:</b>

```typescript
onDelete?: (source: ProtectableMap<K, V>, key: K) => void;
```
