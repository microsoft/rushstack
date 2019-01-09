[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IStringBuilder](./node-core-library.istringbuilder.md)

## IStringBuilder interface

An interface for a builder object that allows a large text string to be constructed incrementally by appending small chunks.

<b>Signature:</b>

```typescript
export interface IStringBuilder 
```

## Methods

|  <p>Method</p> | <p>Description</p> |
|  --- | --- |
|  <p>[append(text)](./node-core-library.istringbuilder.append.md)</p> | <p>Append the specified text to the buffer.</p> |
|  <p>[toString()](./node-core-library.istringbuilder.tostring.md)</p> | <p>Returns a single string containing all the text that was appended to the buffer so far.</p> |

## Remarks

[StringBuilder](./node-core-library.stringbuilder.md) is the default implementation of this contract.

