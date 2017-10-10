[Home](./index) &gt; [local](local.md) &gt; [Excel\_Worksheet](local.excel_worksheet.md) &gt; [getCell](local.excel_worksheet.getcell.md)

# Excel\_Worksheet.getCell method

Gets the range object containing the single cell based on row and column numbers. The cell can be outside the bounds of its parent range, so long as it's stays within the worksheet grid. 

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

