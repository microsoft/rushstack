const STANDARD_ALPHABET: &[u8; 64] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn append_standard_base64(bytes: &[u8], output: &mut String) {
    output.reserve(bytes.len().div_ceil(3) * 4);
    let (chunks, remainder) = bytes.as_chunks::<3>();
    for chunk in chunks {
        let combined_bits =
            ((chunk[0] as u32) << 16) | ((chunk[1] as u32) << 8) | (chunk[2] as u32);
        output.push(STANDARD_ALPHABET[((combined_bits >> 18) & 0x3f) as usize] as char);
        output.push(STANDARD_ALPHABET[((combined_bits >> 12) & 0x3f) as usize] as char);
        output.push(STANDARD_ALPHABET[((combined_bits >> 6) & 0x3f) as usize] as char);
        output.push(STANDARD_ALPHABET[(combined_bits & 0x3f) as usize] as char);
    }
    if remainder.len() == 1 {
        let combined_bits = (remainder[0] as u32) << 16;
        output.push(STANDARD_ALPHABET[((combined_bits >> 18) & 0x3f) as usize] as char);
        output.push(STANDARD_ALPHABET[((combined_bits >> 12) & 0x3f) as usize] as char);
        output.push('=');
        output.push('=');
    } else if remainder.len() == 2 {
        let combined_bits = ((remainder[0] as u32) << 16) | ((remainder[1] as u32) << 8);
        output.push(STANDARD_ALPHABET[((combined_bits >> 18) & 0x3f) as usize] as char);
        output.push(STANDARD_ALPHABET[((combined_bits >> 12) & 0x3f) as usize] as char);
        output.push(STANDARD_ALPHABET[((combined_bits >> 6) & 0x3f) as usize] as char);
        output.push('=');
    }
}

pub fn sha256_digest_as_base64(digest: &[u8; 32]) -> [u8; 44] {
    let mut encoded = [b'='; 44];
    let (chunks, remainder) = digest.as_chunks::<3>();
    for (chunk_index, chunk) in chunks.iter().enumerate() {
        let combined_bits = ((chunk[0] as u32) << 16) | ((chunk[1] as u32) << 8) | (chunk[2] as u32);
        for (offset, shift) in [18, 12, 6, 0].into_iter().enumerate() {
            encoded[chunk_index * 4 + offset] = STANDARD_ALPHABET[((combined_bits >> shift) & 0x3f) as usize];
        }
    }
    let combined_bits = ((remainder[0] as u32) << 16) | ((remainder[1] as u32) << 8);
    for (offset, shift) in [18, 12, 6].into_iter().enumerate() {
        encoded[40 + offset] = STANDARD_ALPHABET[((combined_bits >> shift) & 0x3f) as usize];
    }
    encoded
}
