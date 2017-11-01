[Home](./index) &gt; [@microsoft/api-extractor](api-extractor.md) &gt; [Markup](api-extractor.markup.md) &gt; [createWebLink](api-extractor.markup.createweblink.md)

# Markup.createWebLink method

Constructs an IMarkupWebLink element that represents a hyperlink an internet URL.

**Signature:**
```javascript
public static createWebLink(textElements: MarkupLinkTextElement[], targetUrl: string): IMarkupWebLink;
```
**Returns:** `IMarkupWebLink`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `textElements` | `MarkupLinkTextElement[]` | the markup sequence that will serve as the link text |
|  `targetUrl` | `string` | the URL that the hyperlink will point to |

