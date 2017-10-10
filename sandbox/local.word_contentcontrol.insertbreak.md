[Home](./index) &gt; [local](local.md) &gt; [Word\_ContentControl](local.word_contentcontrol.md) &gt; [insertBreak](local.word_contentcontrol.insertbreak.md)

# Word\_ContentControl.insertBreak method

Inserts a break at the specified location in the main document. The insertLocation value can be 'Start', 'End', 'Before' or 'After'. This method cannot be used with 'RichTextTable', 'RichTextTableRow' and 'RichTextTableCell' content controls. 

 \[Api set: WordApi 1.1\]

**Signature:**
```javascript
insertBreak(breakType: string, insertLocation: string): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `breakType` | `string` |  |
|  `insertLocation` | `string` |  |

