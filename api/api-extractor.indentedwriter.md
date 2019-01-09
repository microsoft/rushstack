[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IndentedWriter](./api-extractor.indentedwriter.md)

## IndentedWriter class

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

A utility for writing indented text.

<b>Signature:</b>

```typescript
export declare class IndentedWriter 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [defaultIndentPrefix](./api-extractor.indentedwriter.defaultindentprefix.md) |  | `string` | <b><i>(BETA)</i></b> The text characters used to create one level of indentation. Two spaces by default. |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [decreaseIndent()](./api-extractor.indentedwriter.decreaseindent.md) |  | <b><i>(BETA)</i></b> Decreases the indentation, reverting the effect of the corresponding call to IndentedWriter.increaseIndent(). |
|  [ensureNewLine()](./api-extractor.indentedwriter.ensurenewline.md) |  | <b><i>(BETA)</i></b> Adds a newline if the file pointer is not already at the start of the line (or start of the stream). |
|  [ensureSkippedLine()](./api-extractor.indentedwriter.ensureskippedline.md) |  | <b><i>(BETA)</i></b> Adds up to two newlines to ensure that there is a blank line above the current line. |
|  [getText()](./api-extractor.indentedwriter.gettext.md) |  | <b><i>(BETA)</i></b> Retrieves the output that was built so far. |
|  [increaseIndent(indentPrefix)](./api-extractor.indentedwriter.increaseindent.md) |  | <b><i>(BETA)</i></b> Increases the indentation. Normally the indentation is two spaces, however an arbitrary prefix can optional be specified. (For example, the prefix could be "// " to indent and comment simultaneously.) Each call to IndentedWriter.increaseIndent() must be followed by a corresponding call to IndentedWriter.decreaseIndent(). |
|  [indentScope(scope, indentPrefix)](./api-extractor.indentedwriter.indentscope.md) |  | <b><i>(BETA)</i></b> A shorthand for ensuring that increaseIndent()/decreaseIndent() occur in pairs. |
|  [peekLastCharacter()](./api-extractor.indentedwriter.peeklastcharacter.md) |  | <b><i>(BETA)</i></b> Returns the last character that was written, or an empty string if no characters have been written yet. |
|  [peekSecondLastCharacter()](./api-extractor.indentedwriter.peeksecondlastcharacter.md) |  | <b><i>(BETA)</i></b> Returns the second to last character that was written, or an empty string if less than one characters have been written yet. |
|  [toString()](./api-extractor.indentedwriter.tostring.md) |  | <b><i>(BETA)</i></b> |
|  [write(message)](./api-extractor.indentedwriter.write.md) |  | <b><i>(BETA)</i></b> Writes some text to the internal string buffer, applying indentation according to the current indentation level. If the string contains multiple newlines, each line will be indented separately. |
|  [writeLine(message)](./api-extractor.indentedwriter.writeline.md) |  | <b><i>(BETA)</i></b> A shorthand for writing an optional message, followed by a newline. Indentation is applied following the semantics of IndentedWriter.write(). |

## Remarks

Note that the indentation is inserted at the last possible opportunity. For example, this code...

```ts
  writer.write('begin\n');
  writer.increaseIndent();
  writer.write('one\ntwo\n');
  writer.decreaseIndent();
  writer.increaseIndent();
  writer.decreaseIndent();
  writer.write('end');

```
...would produce this output:

```
  begin
    one
    two
  end

```

