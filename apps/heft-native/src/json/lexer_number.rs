use super::cursor::{JsonCursor, JsonScanResult, JsonTextNeedsJavaScriptParser};
use super::value::JsonNumber;

impl<'text> JsonCursor<'text> {
    pub(super) fn read_number_literal(&mut self) -> JsonScanResult<JsonNumber<'text>> {
        let start = self.position;
        if self.peek_byte() == Some(b'-') {
            self.position += 1;
        }
        match self.next_byte_or_refuse()? {
            b'0' => self.position += 1,
            b'1'..=b'9' => self.skip_decimal_digits(),
            _ => return Err(JsonTextNeedsJavaScriptParser),
        }
        if self.peek_byte() == Some(b'.') {
            self.position += 1;
            self.require_at_least_one_decimal_digit()?;
        }
        if let Some(b'e' | b'E') = self.peek_byte() {
            self.position += 1;
            if let Some(b'+' | b'-') = self.peek_byte() {
                self.position += 1;
            }
            self.require_at_least_one_decimal_digit()?;
        }
        if let Some(following) = self.peek_byte() {
            if following.is_ascii_alphanumeric()
                || matches!(following, b'.' | b'_' | b'$')
                || following >= 0x80
            {
                return Err(JsonTextNeedsJavaScriptParser);
            }
        }
        let source_text = &self.text[start..self.position];
        let value: f64 = source_text
            .parse()
            .map_err(|_| JsonTextNeedsJavaScriptParser)?;
        Ok(JsonNumber { value, source_text })
    }

    fn skip_decimal_digits(&mut self) {
        while let Some(b'0'..=b'9') = self.peek_byte() {
            self.position += 1;
        }
    }

    fn require_at_least_one_decimal_digit(&mut self) -> JsonScanResult<()> {
        if !matches!(self.peek_byte(), Some(b'0'..=b'9')) {
            return Err(JsonTextNeedsJavaScriptParser);
        }
        self.skip_decimal_digits();
        Ok(())
    }
}
