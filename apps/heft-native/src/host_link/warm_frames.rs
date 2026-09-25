use std::io::{self, ErrorKind, Read, Write};

pub const RUN_FRAME: u8 = 0x01;
pub const ACCEPT_FRAME: u8 = 0x10;
pub const STANDARD_OUTPUT_FRAME: u8 = 0x12;
pub const STANDARD_ERROR_FRAME: u8 = 0x13;
pub const EXIT_FRAME: u8 = 0x14;
pub const MAXIMUM_FRAME_PAYLOAD_BYTES: usize = 1024 * 1024;
const FRAME_HEADER_BYTES: usize = 5;

pub fn write_frame(output: &mut impl Write, frame_type: u8, payload: &[u8]) -> io::Result<()> {
    let payload_length =
        u32::try_from(payload.len()).map_err(|_| io::Error::from(ErrorKind::InvalidInput))?;
    let mut frame_header = [0u8; FRAME_HEADER_BYTES];
    frame_header[..4].copy_from_slice(&payload_length.to_le_bytes());
    frame_header[4] = frame_type;
    output.write_all(&frame_header)?;
    output.write_all(payload)
}

pub fn read_frame(input: &mut impl Read, payload: &mut Vec<u8>) -> io::Result<Option<u8>> {
    let mut frame_header = [0u8; FRAME_HEADER_BYTES];
    let first_byte_count = loop {
        match input.read(&mut frame_header) {
            Err(read_error) if read_error.kind() == ErrorKind::Interrupted => continue,
            read_result => break read_result?,
        }
    };
    if first_byte_count == 0 {
        return Ok(None);
    }
    input.read_exact(&mut frame_header[first_byte_count..])?;
    let payload_length = u32::from_le_bytes([
        frame_header[0],
        frame_header[1],
        frame_header[2],
        frame_header[3],
    ]) as usize;
    if payload_length > MAXIMUM_FRAME_PAYLOAD_BYTES {
        return Err(io::Error::from(ErrorKind::InvalidData));
    }
    payload.clear();
    payload.resize(payload_length, 0);
    input.read_exact(payload)?;
    Ok(Some(frame_header[4]))
}

pub fn exit_code_of_exit_frame(payload: &[u8]) -> Option<i32> {
    let exit_code_bytes: [u8; 4] = payload.try_into().ok()?;
    Some(i32::from_le_bytes(exit_code_bytes))
}
