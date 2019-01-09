[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Sort](./node-core-library.sort.md) &gt; [sortMapKeys](./node-core-library.sort.sortmapkeys.md)

## Sort.sortMapKeys() method

Sorts the entries in a Map object according to the keys.

<b>Signature:</b>

```typescript
static sortMapKeys<K, V>(map: Map<K, V>, keyComparer?: (x: K, y: K) => number): void;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  map | `Map<K, V>` |  |
|  keyComparer | `(x: K, y: K) => number` |  |

<b>Returns:</b>

`void`

## Example


```ts
let map: Map<string, number> = new Map<string, number>();
map.set('zebra', 1);
map.set('goose', 2);
map.set('aardvark', 3);
Sort.sortMapKeys(map);
console.log(JSON.stringify(Array.from(map.keys()))); // ["aardvark","goose","zebra"]

```

