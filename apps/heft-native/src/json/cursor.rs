use super::duplicate_key_index::JsonObjectEntry;
use super::value::JsonValue;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct JsonTextNeedsJavaScriptParser;

pub(super) type JsonScanResult<T> = Result<T, JsonTextNeedsJavaScriptParser>;

pub(super) const MAXIMUM_NESTING_DEPTH: u32 = 512;

pub(super) struct JsonCursor<'text> {
    pub(super) text: &'text str,
    pub(super) bytes: &'text [u8],
    pub(super) position: usize,
    pub(super) depth: u32,
    pub(super) allows_comments_and_trailing_commas: bool,
    pub(super) pending_array_items: Vec<JsonValue<'text>>,
    pub(super) pending_object_entries: Vec<JsonObjectEntry<'text>>,
}

impl<'text> JsonCursor<'text> {
    pub(super) fn new(text: &'text str, allows_comments_and_trailing_commas: bool) -> Self {
        JsonCursor {
            text,
            bytes: text.as_bytes(),
            position: 0,
            depth: 0,
            allows_comments_and_trailing_commas,
            pending_array_items: Vec::new(),
            pending_object_entries: Vec::new(),
        }
    }

    pub(super) fn refuse_unless_comments_and_trailing_commas_are_allowed(
        &self,
    ) -> JsonScanResult<()> {
        if self.allows_comments_and_trailing_commas {
            Ok(())
        } else {
            Err(JsonTextNeedsJavaScriptParser)
        }
    }

    pub(super) fn peek_byte(&self) -> Option<u8> {
        self.bytes.get(self.position).copied()
    }

    pub(super) fn peek_byte_after(&self, offset: usize) -> Option<u8> {
        self.bytes.get(self.position + offset).copied()
    }

    pub(super) fn next_byte_or_refuse(&self) -> JsonScanResult<u8> {
        self.peek_byte().ok_or(JsonTextNeedsJavaScriptParser)
    }

    pub(super) fn is_at_line_or_paragraph_separator(&self) -> bool {
        self.peek_byte() == Some(0xe2)
            && self.peek_byte_after(1) == Some(0x80)
            && matches!(self.peek_byte_after(2), Some(0xa8 | 0xa9))
    }

    pub(super) fn is_at_end(&self) -> bool {
        self.position >= self.bytes.len()
    }

    pub(super) fn enter_nested_value(&mut self) -> JsonScanResult<()> {
        self.depth += 1;
        if self.depth > MAXIMUM_NESTING_DEPTH {
            return Err(JsonTextNeedsJavaScriptParser);
        }
        Ok(())
    }

    pub(super) fn leave_nested_value(&mut self) {
        self.depth -= 1;
    }
}
