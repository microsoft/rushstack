[Home](./index) &gt; [@microsoft/api-extractor](api-extractor.md) &gt; [Markup](api-extractor.markup.md) &gt; [createApiLink](api-extractor.markup.createapilink.md)

# Markup.createApiLink method

Constructs an IMarkupApiLink element that represents a hyperlink to the specified API object. The hyperlink is applied to an existing stream of markup elements.

**Signature:**
```javascript
public static createApiLink(textElements: MarkupLinkTextElement[], target: IApiItemReference): IMarkupApiLink;
```
**Returns:** `IMarkupApiLink`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `textElements` | `MarkupLinkTextElement[]` | the markup sequence that will serve as the link text |
|  `target` | `IApiItemReference` | the API object that the hyperlink will point to |

