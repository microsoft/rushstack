[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [Markup](./api-extractor.markup.md) &gt; [appendTextElements](./api-extractor.markup.appendtextelements.md)

# Markup.appendTextElements method

Appends text content to the `output` array. If the last item in the array is a compatible IMarkupText element, the text will be merged into it. Otherwise, a new IMarkupText element will be created.

**Signature:**
```javascript
static appendTextElements(output: MarkupElement[], text: string, options?: IMarkupCreateTextOptions): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `output` | `MarkupElement[]` |  |
|  `text` | `string` |  |
|  `options` | `IMarkupCreateTextOptions` |  |

