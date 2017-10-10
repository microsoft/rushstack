[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [networkDays\_Intl](local.excel_functions.networkdays_intl.md)

# Excel\_Functions.networkDays\_Intl method

Returns the number of whole workdays between two dates with custom weekend parameters. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
networkDays_Intl(startDate: number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, endDate: number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, weekend?: number | string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, holidays?: number | string | Excel.Range | boolean | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `startDate` | `number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `endDate` | `number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `weekend` | `number | string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `holidays` | `number | string | Excel.Range | boolean | Excel.RangeReference | Excel.FunctionResult<any>` |  |

