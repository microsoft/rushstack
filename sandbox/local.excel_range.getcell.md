[Home](./index) &gt; [local](local.md) &gt; [Excel\_Range](local.excel_range.md) &gt; [getCell](local.excel_range.getcell.md)

# Excel\_Range.getCell method

Gets the range object containing the single cell based on row and column numbers. The cell can be outside the bounds of its parent range, so long as it's stays within the worksheet grid. The returned cell is located relative to the top left cell of the range. 

 \[Api set: ExcelApi 1.1\]

**Signature:**
```javascript
getCell(row: number, column: number): Excel.Range;
```
**Returns:** `Excel.Range`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `row` | `number` |  |
|  `column` | `number` |  |

