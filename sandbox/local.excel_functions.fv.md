[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [fv](local.excel_functions.fv.md)

# Excel\_Functions.fv method

Returns the future value of an investment based on periodic, constant payments and a constant interest rate. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
fv(rate: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, nper: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, pmt: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, pv?: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, type?: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `rate` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `nper` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `pmt` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `pv` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `type` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

