[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Sort](./node-core-library.sort.md) &gt; [sortBy](./node-core-library.sort.sortby.md)

## Sort.sortBy() method

Sorts the array according to a key which is obtained from the array elements.

<b>Signature:</b>

```typescript
static sortBy<T>(array: T[], keySelector: (element: T) => any, comparer?: (x: any, y: any) => number): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>array</p> | <p>`T[]`</p> |  |
|  <p>keySelector</p> | <p>`(element: T) => any`</p> |  |
|  <p>comparer</p> | <p>`(x: any, y: any) => number`</p> |  |

<b>Returns:</b>

`void`

## Example


```ts
let array: string[] = [ 'aaa', 'bb', 'c' ];
Sort.sortBy(array, x => x.length);  // [ 'c', 'bb', 'aaa' ]

```

