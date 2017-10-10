[Home](./index) &gt; [local](local.md) &gt; [Excel\_Worksheet](local.excel_worksheet.md) &gt; [getUsedRange](local.excel_worksheet.getusedrange.md)

# Excel\_Worksheet.getUsedRange method

The used range is the smallest range that encompasses any cells that have a value or formatting assigned to them. If the entire worksheet is blank, this function will return the top left cell (i.e.,: it will \*not\* throw an error). 

 \[Api set: ExcelApi 1.1\]

**Signature:**
```javascript
getUsedRange(valuesOnly?: boolean): Excel.Range;
```
**Returns:** `Excel.Range`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `valuesOnly` | `boolean` |  |

