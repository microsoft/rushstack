[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [timevalue](local.excel_functions.timevalue.md)

# Excel\_Functions.timevalue method

Converts a text time to an Excel serial number for a time, a number from 0 (12:00:00 AM) to 0.999988426 (11:59:59 PM). Format the number with a time format after entering the formula. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
timevalue(timeText: string | number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `timeText` | `string | number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

