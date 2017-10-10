[Home](./index) &gt; [local](local.md) &gt; [Excel\_Worksheet](local.excel_worksheet.md) &gt; [getUsedRangeOrNullObject](local.excel_worksheet.getusedrangeornullobject.md)

# Excel\_Worksheet.getUsedRangeOrNullObject method

The used range is the smallest range that encompasses any cells that have a value or formatting assigned to them. If the entire worksheet is blank, this function will return a null object. 

 \[Api set: ExcelApi 1.4\]

**Signature:**
```javascript
getUsedRangeOrNullObject(valuesOnly?: boolean): Excel.Range;
```
**Returns:** `Excel.Range`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `valuesOnly` | `boolean` |  |

