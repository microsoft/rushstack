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

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[defaultIndentPrefix](./api-extractor.indentedwriter.defaultindentprefix.md)</p> |  | <p>`string`</p> | <p><b><i>(BETA)</i></b> The text characters used to create one level of indentation. Two spaces by default.</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[decreaseIndent()](./api-extractor.indentedwriter.decreaseindent.md)</p> |  | <p><b><i>(BETA)</i></b> Decreases the indentation, reverting the effect of the corresponding call to IndentedWriter.increaseIndent().</p> |
|  <p>[ensureNewLine()](./api-extractor.indentedwriter.ensurenewline.md)</p> |  | <p><b><i>(BETA)</i></b> Adds a newline if the file pointer is not already at the start of the line (or start of the stream).</p> |
|  <p>[ensureSkippedLine()](./api-extractor.indentedwriter.ensureskippedline.md)</p> |  | <p><b><i>(BETA)</i></b> Adds up to two newlines to ensure that there is a blank line above the current line.</p> |
|  <p>[getText()](./api-extractor.indentedwriter.gettext.md)</p> |  | <p><b><i>(BETA)</i></b> Retrieves the output that was built so far.</p> |
|  <p>[increaseIndent(indentPrefix)](./api-extractor.indentedwriter.increaseindent.md)</p> |  | <p><b><i>(BETA)</i></b> Increases the indentation. Normally the indentation is two spaces, however an arbitrary prefix can optional be specified. (For example, the prefix could be "// " to indent and comment simultaneously.) Each call to IndentedWriter.increaseIndent() must be followed by a corresponding call to IndentedWriter.decreaseIndent().</p> |
|  <p>[indentScope(scope, indentPrefix)](./api-extractor.indentedwriter.indentscope.md)</p> |  | <p><b><i>(BETA)</i></b> A shorthand for ensuring that increaseIndent()/decreaseIndent() occur in pairs.</p> |
|  <p>[peekLastCharacter()](./api-extractor.indentedwriter.peeklastcharacter.md)</p> |  | <p><b><i>(BETA)</i></b> Returns the last character that was written, or an empty string if no characters have been written yet.</p> |
|  <p>[peekSecondLastCharacter()](./api-extractor.indentedwriter.peeksecondlastcharacter.md)</p> |  | <p><b><i>(BETA)</i></b> Returns the second to last character that was written, or an empty string if less than one characters have been written yet.</p> |
|  <p>[toString()](./api-extractor.indentedwriter.tostring.md)</p> |  | <p><b><i>(BETA)</i></b></p> |
|  <p>[write(message)](./api-extractor.indentedwriter.write.md)</p> |  | <p><b><i>(BETA)</i></b> Writes some text to the internal string buffer, applying indentation according to the current indentation level. If the string contains multiple newlines, each line will be indented separately.</p> |
|  <p>[writeLine(message)](./api-extractor.indentedwriter.writeline.md)</p> |  | <p><b><i>(BETA)</i></b> A shorthand for writing an optional message, followed by a newline. Indentation is applied following the semantics of IndentedWriter.write().</p> |

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

