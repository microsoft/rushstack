[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Text](./node-core-library.text.md)

## Text class

Operations for working with strings that contain text.

<b>Signature:</b>

```typescript
export declare class Text 
```

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[convertToCrLf(input)](./node-core-library.text.converttocrlf.md)</p> | <p>`static`</p> | <p>Converts all newlines in the provided string to use Windows-style CRLF end of line characters.</p> |
|  <p>[convertToLf(input)](./node-core-library.text.converttolf.md)</p> | <p>`static`</p> | <p>Converts all newlines in the provided string to use POSIX-style LF end of line characters.</p><p>POSIX is a registered trademark of the Institute of Electrical and Electronic Engineers, Inc.</p> |
|  <p>[ensureTrailingNewline(s, newlineKind)](./node-core-library.text.ensuretrailingnewline.md)</p> | <p>`static`</p> | <p>Returns the input string with a trailing `\n` character appended, if not already present.</p> |
|  <p>[padEnd(s, minimumLength, paddingCharacter)](./node-core-library.text.padend.md)</p> | <p>`static`</p> | <p>Append characters to the end of a string to ensure the result has a minimum length.</p> |
|  <p>[padStart(s, minimumLength, paddingCharacter)](./node-core-library.text.padstart.md)</p> | <p>`static`</p> | <p>Append characters to the start of a string to ensure the result has a minimum length.</p> |
|  <p>[replaceAll(input, searchValue, replaceValue)](./node-core-library.text.replaceall.md)</p> | <p>`static`</p> | <p>Returns the same thing as targetString.replace(searchValue, replaceValue), except that all matches are replaced, rather than just the first match.</p> |
|  <p>[truncateWithEllipsis(s, maximumLength)](./node-core-library.text.truncatewithellipsis.md)</p> | <p>`static`</p> | <p>If the string is longer than maximumLength characters, truncate it to that length using "..." to indicate the truncation.</p> |

## Remarks

The utilities provided by this class are intended to be simple, small, and very broadly applicable.

