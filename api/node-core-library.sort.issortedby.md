[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Sort](./node-core-library.sort.md) &gt; [isSortedBy](./node-core-library.sort.issortedby.md)

## Sort.isSortedBy() method

Returns true if the array is already sorted by the specified key.

<b>Signature:</b>

```typescript
static isSortedBy<T>(array: T[], keySelector: (element: T) => any, comparer?: (x: any, y: any) => number): boolean;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>array</p> | <p>`T[]`</p> |  |
|  <p>keySelector</p> | <p>`(element: T) => any`</p> |  |
|  <p>comparer</p> | <p>`(x: any, y: any) => number`</p> |  |

<b>Returns:</b>

`boolean`

## Example


```ts
let array: string[] = [ 'a', 'bb', 'ccc' ];
Sort.isSortedBy(array, x => x.length); // true

```

