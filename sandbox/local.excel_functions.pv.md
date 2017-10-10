[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [pv](local.excel_functions.pv.md)

# Excel\_Functions.pv method

Returns the present value of an investment: the total amount that a series of future payments is worth now. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
pv(rate: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, nper: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, pmt: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, fv?: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, type?: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `rate` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `nper` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `pmt` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `fv` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `type` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

