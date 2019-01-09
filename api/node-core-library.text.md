[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Text](./node-core-library.text.md)

## Text class

Operations for working with strings that contain text.

<b>Signature:</b>

```typescript
export declare class Text 
```

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [convertToCrLf(input)](./node-core-library.text.converttocrlf.md) | `static` | Converts all newlines in the provided string to use Windows-style CRLF end of line characters. |
|  [convertToLf(input)](./node-core-library.text.converttolf.md) | `static` | Converts all newlines in the provided string to use POSIX-style LF end of line characters.<!-- -->POSIX is a registered trademark of the Institute of Electrical and Electronic Engineers, Inc. |
|  [ensureTrailingNewline(s, newlineKind)](./node-core-library.text.ensuretrailingnewline.md) | `static` | Returns the input string with a trailing `\n` character appended, if not already present. |
|  [padEnd(s, minimumLength, paddingCharacter)](./node-core-library.text.padend.md) | `static` | Append characters to the end of a string to ensure the result has a minimum length. |
|  [padStart(s, minimumLength, paddingCharacter)](./node-core-library.text.padstart.md) | `static` | Append characters to the start of a string to ensure the result has a minimum length. |
|  [replaceAll(input, searchValue, replaceValue)](./node-core-library.text.replaceall.md) | `static` | Returns the same thing as targetString.replace(searchValue, replaceValue), except that all matches are replaced, rather than just the first match. |
|  [truncateWithEllipsis(s, maximumLength)](./node-core-library.text.truncatewithellipsis.md) | `static` | If the string is longer than maximumLength characters, truncate it to that length using "..." to indicate the truncation. |

## Remarks

The utilities provided by this class are intended to be simple, small, and very broadly applicable.

