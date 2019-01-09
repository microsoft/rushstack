[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Sort](./node-core-library.sort.md) &gt; [sortSetBy](./node-core-library.sort.sortsetby.md)

## Sort.sortSetBy() method

Sorts the entries in a Set object according to the keys.

<b>Signature:</b>

```typescript
static sortSetBy<T>(set: Set<T>, keySelector: (element: T) => any, keyComparer?: (x: T, y: T) => number): void;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  set | `Set<T>` |  |
|  keySelector | `(element: T) => any` |  |
|  keyComparer | `(x: T, y: T) => number` |  |

<b>Returns:</b>

`void`

## Example


```ts
let set: Set<string> = new Set<string>();
set.add('aaa');
set.add('bb');
set.add('c');
Sort.sortSetBy(set, x => x.length);
console.log(Array.from(set)); // ['c', 'bb', 'aaa']

```

