[Home](./index) &gt; [local](local.md) &gt; [Word\_CustomProperty](local.word_customproperty.md) &gt; [value](local.word_customproperty.value.md)

# Word\_CustomProperty.value property

Gets or sets the value of the custom property. Note that even though Word Online and the docx file format allow these properties to be arbitrarily long, the desktop version of Word will truncate string values to 255 16-bit chars (possibly creating invalid unicode by breaking up a surrogate pair). 

 \[Api set: WordApi 1.3\]

**Signature:**
```javascript
value: any
```
