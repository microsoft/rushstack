[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [Markup](./api-extractor.markup.md) &gt; [createTextElements](./api-extractor.markup.createtextelements.md)

# Markup.createTextElements method

Constructs an IMarkupText element representing the specified text string, with optional formatting.

**Signature:**
```javascript
static createTextElements(text: string, options?: IMarkupCreateTextOptions): IMarkupText[];
```
**Returns:** `IMarkupText[]`

## Remarks

NOTE: All whitespace (including newlines) will be collapsed to single spaces. This behavior is similar to how HTML handles whitespace. To preserve newlines, use [Markup.createTextParagraphs](./api-extractor.markup.createtextparagraphs.md) instead.

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `text` | `string` |  |
|  `options` | `IMarkupCreateTextOptions` |  |

