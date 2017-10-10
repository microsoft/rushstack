[Home](./index) &gt; [local](local.md) &gt; [Excel\_Range](local.excel_range.md) &gt; [getOffsetRange](local.excel_range.getoffsetrange.md)

# Excel\_Range.getOffsetRange method

Gets an object which represents a range that's offset from the specified range. The dimension of the returned range will match this range. If the resulting range is forced outside the bounds of the worksheet grid, an error will be thrown. 

 \[Api set: ExcelApi 1.1\]

**Signature:**
```javascript
getOffsetRange(rowOffset: number, columnOffset: number): Excel.Range;
```
**Returns:** `Excel.Range`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `rowOffset` | `number` |  |
|  `columnOffset` | `number` |  |

