use super::cursor::{JsonCursor, JsonScanResult, JsonTextNeedsJavaScriptParser};

impl JsonCursor<'_> {
    pub(super) fn skip_whitespace_and_comments(&mut self) -> JsonScanResult<()> {
        loop {
            match self.peek_byte() {
                Some(b' ' | b'\t' | b'\n' | b'\r') => self.position += 1,
                Some(b'/') => {
                    self.refuse_unless_comments_and_trailing_commas_are_allowed()?;
                    match self.peek_byte_after(1) {
                        Some(b'/') => self.skip_line_comment()?,
                        Some(b'*') => self.skip_block_comment()?,
                        _ => return Err(JsonTextNeedsJavaScriptParser),
                    }
                }
                _ => return Ok(()),
            }
        }
    }

    fn skip_line_comment(&mut self) -> JsonScanResult<()> {
        self.position += 2;
        while let Some(byte) = self.peek_byte() {
            if byte == b'\n' || byte == b'\r' {
                return Ok(());
            }
            if self.is_at_line_or_paragraph_separator() {
                return Err(JsonTextNeedsJavaScriptParser);
            }
            self.position += 1;
        }
        Ok(())
    }

    fn skip_block_comment(&mut self) -> JsonScanResult<()> {
        self.position += 2;
        loop {
            match self.peek_byte() {
                None => return Err(JsonTextNeedsJavaScriptParser),
                Some(b'*') if self.peek_byte_after(1) == Some(b'/') => {
                    self.position += 2;
                    return Ok(());
                }
                Some(_) => self.position += 1,
            }
        }
    }
}
