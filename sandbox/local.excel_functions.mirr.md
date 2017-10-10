[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [mirr](local.excel_functions.mirr.md)

# Excel\_Functions.mirr method

Returns the internal rate of return for a series of periodic cash flows, considering both cost of investment and interest on reinvestment of cash. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
mirr(values: Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, financeRate: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, reinvestRate: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `values` | `Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `financeRate` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `reinvestRate` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

