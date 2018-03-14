[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [Markup](./api-extractor.markup.md) &gt; [extractTextContent](./api-extractor.markup.extracttextcontent.md)

# Markup.extractTextContent method

Extracts plain text from the provided markup elements, discarding any formatting.

**Signature:**
```javascript
static extractTextContent(elements: MarkupElement[]): string;
```
**Returns:** `string`

## Remarks

The returned string is suitable for counting words or extracting search keywords. Its formatting is not guaranteed, and may change in future updates of this API.

API Extractor determines whether an API is "undocumented" by using extractTextContent() to extract the text from its summary, and then counting the number of words.

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `elements` | `MarkupElement[]` |  |

