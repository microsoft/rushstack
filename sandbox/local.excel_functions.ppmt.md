[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [ppmt](local.excel_functions.ppmt.md)

# Excel\_Functions.ppmt method

Returns the payment on the principal for a given investment based on periodic, constant payments and a constant interest rate. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
ppmt(rate: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, per: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, nper: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, pv: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, fv?: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, type?: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `rate` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `per` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `nper` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `pv` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `fv` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `type` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

