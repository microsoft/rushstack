[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Sort](./node-core-library.sort.md) &gt; [sortSet](./node-core-library.sort.sortset.md)

## Sort.sortSet() method

Sorts the entries in a Set object according to the keys.

<b>Signature:</b>

```typescript
static sortSet<T>(set: Set<T>, comparer?: (x: T, y: T) => number): void;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  set | `Set<T>` |  |
|  comparer | `(x: T, y: T) => number` |  |

<b>Returns:</b>

`void`

## Example


```ts
let set: Set<string> = new Set<string>();
set.add('zebra');
set.add('goose');
set.add('aardvark');
Sort.sortSet(set);
console.log(Array.from(set)); // ['aardvark', 'goose', 'zebra']

```

