[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [networkDays](local.excel_functions.networkdays.md)

# Excel\_Functions.networkDays method

Returns the number of whole workdays between two dates. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
networkDays(startDate: number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, endDate: number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, holidays?: number | string | Excel.Range | boolean | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `startDate` | `number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `endDate` | `number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `holidays` | `number | string | Excel.Range | boolean | Excel.RangeReference | Excel.FunctionResult<any>` |  |

