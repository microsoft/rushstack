[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [StringBuilder](./node-core-library.stringbuilder.md)

## StringBuilder class

This class allows a large text string to be constructed incrementally by appending small chunks. The final string can be obtained by calling StringBuilder.toString().

<b>Signature:</b>

```typescript
export declare class StringBuilder implements IStringBuilder 
```

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [append(text)](./node-core-library.stringbuilder.append.md) |  |  |
|  [toString()](./node-core-library.stringbuilder.tostring.md) |  |  |

## Remarks

A naive approach might use the `+=` operator to append strings: This would have the downside of copying the entire string each time a chunk is appended, resulting in `O(n^2)` bytes of memory being allocated (and later freed by the garbage collector), and many of the allocations could be very large objects. StringBuilder avoids this overhead by accumulating the chunks in an array, and efficiently joining them when `getText()` is finally called.

