[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [rate](local.excel_functions.rate.md)

# Excel\_Functions.rate method

Returns the interest rate per period of a loan or an investment. For example, use 6%/4 for quarterly payments at 6% APR. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
rate(nper: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, pmt: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, pv: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, fv?: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, type?: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, guess?: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `nper` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `pmt` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `pv` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `fv` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `type` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `guess` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

