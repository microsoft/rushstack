[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [Markup](./api-extractor.markup.md) &gt; [normalize](./api-extractor.markup.normalize.md)

# Markup.normalize method

Use this to clean up a MarkupElement sequence, assuming the sequence is now in its final form.

**Signature:**
```javascript
static normalize<T extends MarkupElement>(elements: T[]): void;
```
**Returns:** `void`

## Remarks

The following operations are performed:

1. Remove leading/trailing white space around paragraphs

2. Remove redundant paragraph elements

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `elements` | `T[]` |  |

