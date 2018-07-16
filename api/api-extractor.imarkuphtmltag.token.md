[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IMarkupHtmlTag](./api-extractor.imarkuphtmltag.md) &gt; [token](./api-extractor.imarkuphtmltag.token.md)

# IMarkupHtmlTag.token property

A string containing the HTML tag.

**Signature:**
```javascript
token: string
```

## Remarks

To avoid parsing ambiguities with other AEDoc constructs, API Extractor will ensure that this string is a complete and properly formatted opening or closing HTML tag such as \`&lt;td&gt;\` or \`&lt;/td&gt;\` or \`&lt;img src="example.gif" /&gt;\`. Beyond this, API Extractor does NOT attempt to parse the tag attributes, or verify that opening/closing pairs are balanced, or determine whether the nested tree is valid HTML. That responsibility is left to the consuming documentation engine.
