[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Sort](./node-core-library.sort.md)

## Sort class

Operations for sorting collections.

<b>Signature:</b>

```typescript
export declare class Sort 
```

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [compareByValue(x, y)](./node-core-library.sort.comparebyvalue.md) | `static` | Compares `x` and `y` using the JavaScript `>` and `<` operators. This function is suitable for usage as the callback for `array.sort()`<!-- -->. |
|  [isSorted(array, comparer)](./node-core-library.sort.issorted.md) | `static` | Returns true if the array is already sorted. |
|  [isSortedBy(array, keySelector, comparer)](./node-core-library.sort.issortedby.md) | `static` | Returns true if the array is already sorted by the specified key. |
|  [sortBy(array, keySelector, comparer)](./node-core-library.sort.sortby.md) | `static` | Sorts the array according to a key which is obtained from the array elements. |
|  [sortMapKeys(map, keyComparer)](./node-core-library.sort.sortmapkeys.md) | `static` | Sorts the entries in a Map object according to the keys. |
|  [sortSet(set, comparer)](./node-core-library.sort.sortset.md) | `static` | Sorts the entries in a Set object according to the keys. |
|  [sortSetBy(set, keySelector, keyComparer)](./node-core-library.sort.sortsetby.md) | `static` | Sorts the entries in a Set object according to the keys. |

