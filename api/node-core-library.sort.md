[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Sort](./node-core-library.sort.md)

## Sort class

Operations for sorting collections.

<b>Signature:</b>

```typescript
export declare class Sort 
```

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[compareByValue(x, y)](./node-core-library.sort.comparebyvalue.md)</p> | <p>`static`</p> | <p>Compares `x` and `y` using the JavaScript `>` and `<` operators. This function is suitable for usage as the callback for `array.sort()`<!-- -->.</p> |
|  <p>[isSorted(array, comparer)](./node-core-library.sort.issorted.md)</p> | <p>`static`</p> | <p>Returns true if the array is already sorted.</p> |
|  <p>[isSortedBy(array, keySelector, comparer)](./node-core-library.sort.issortedby.md)</p> | <p>`static`</p> | <p>Returns true if the array is already sorted by the specified key.</p> |
|  <p>[sortBy(array, keySelector, comparer)](./node-core-library.sort.sortby.md)</p> | <p>`static`</p> | <p>Sorts the array according to a key which is obtained from the array elements.</p> |
|  <p>[sortMapKeys(map, keyComparer)](./node-core-library.sort.sortmapkeys.md)</p> | <p>`static`</p> | <p>Sorts the entries in a Map object according to the keys.</p> |
|  <p>[sortSet(set, comparer)](./node-core-library.sort.sortset.md)</p> | <p>`static`</p> | <p>Sorts the entries in a Set object according to the keys.</p> |
|  <p>[sortSetBy(set, keySelector, keyComparer)](./node-core-library.sort.sortsetby.md)</p> | <p>`static`</p> | <p>Sorts the entries in a Set object according to the keys.</p> |

