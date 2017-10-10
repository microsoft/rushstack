[Home](./index) &gt; [local](local.md) &gt; [Word\_ContentControl](local.word_contentcontrol.md) &gt; [insertTable](local.word_contentcontrol.inserttable.md)

# Word\_ContentControl.insertTable method

Inserts a table with the specified number of rows and columns into, or next to, a content control. The insertLocation value can be 'Start', 'End', 'Before' or 'After'. 

 \[Api set: WordApi 1.3\]

**Signature:**
```javascript
insertTable(rowCount: number, columnCount: number, insertLocation: string, values?: Array<Array<string>>): Word.Table;
```
**Returns:** `Word.Table`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `rowCount` | `number` |  |
|  `columnCount` | `number` |  |
|  `insertLocation` | `string` |  |
|  `values` | `Array<Array<string>>` |  |

