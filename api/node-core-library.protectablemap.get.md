[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [ProtectableMap](./node-core-library.protectablemap.md) &gt; [get](./node-core-library.protectablemap.get.md)

## ProtectableMap.get() method

Retrieves the value for the specified key.

<b>Signature:</b>

```typescript
get(key: K): V | undefined;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>key</p> | <p>`K`</p> |  |

<b>Returns:</b>

`V | undefined`

undefined if the value is undefined OR if the key is missing; otherwise returns the value associated with the key.

