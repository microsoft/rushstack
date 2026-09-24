const INITIAL_STATE: [u32; 8] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

const ROUND_CONSTANTS: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

pub struct Sha256 {
    state: [u32; 8],
    block_buffer: [u8; 64],
    block_buffer_len: usize,
    length_bytes: u64,
}

impl Sha256 {
    pub fn new() -> Sha256 {
        Sha256 {
            state: INITIAL_STATE,
            block_buffer: [0; 64],
            block_buffer_len: 0,
            length_bytes: 0,
        }
    }

    pub fn update(&mut self, mut data: &[u8]) {
        self.length_bytes = self.length_bytes.wrapping_add(data.len() as u64);
        if self.block_buffer_len != 0 {
            let remaining_space = 64 - self.block_buffer_len;
            let copied_len = remaining_space.min(data.len());
            self.block_buffer[self.block_buffer_len..self.block_buffer_len + copied_len]
                .copy_from_slice(&data[..copied_len]);
            self.block_buffer_len += copied_len;
            data = &data[copied_len..];
            if self.block_buffer_len == 64 {
                let full_block = self.block_buffer;
                self.process_block(&full_block);
                self.block_buffer_len = 0;
            }
        }
        while data.len() >= 64 {
            let mut full_block = [0u8; 64];
            full_block.copy_from_slice(&data[..64]);
            self.process_block(&full_block);
            data = &data[64..];
        }
        if !data.is_empty() {
            self.block_buffer[..data.len()].copy_from_slice(data);
            self.block_buffer_len = data.len();
        }
    }

    pub fn finalize(mut self) -> [u8; 32] {
        let length_bits = self.length_bytes.wrapping_mul(8);
        self.block_buffer[self.block_buffer_len] = 0x80;
        self.block_buffer_len += 1;
        if self.block_buffer_len > 56 {
            for byte in &mut self.block_buffer[self.block_buffer_len..] {
                *byte = 0;
            }
            let full_block = self.block_buffer;
            self.process_block(&full_block);
            self.block_buffer = [0; 64];
            self.block_buffer_len = 0;
        }
        for byte in &mut self.block_buffer[self.block_buffer_len..56] {
            *byte = 0;
        }
        self.block_buffer[56..64].copy_from_slice(&length_bits.to_be_bytes());
        let final_block = self.block_buffer;
        self.process_block(&final_block);
        let mut digest = [0u8; 32];
        for (word_index, state_word) in self.state.iter().enumerate() {
            digest[word_index * 4..word_index * 4 + 4].copy_from_slice(&state_word.to_be_bytes());
        }
        digest
    }

    fn process_block(&mut self, block: &[u8; 64]) {
        let mut message_schedule = [0u32; 64];
        for (word_index, message_word) in message_schedule.iter_mut().enumerate().take(16) {
            let byte_index = word_index * 4;
            *message_word = u32::from_be_bytes([
                block[byte_index],
                block[byte_index + 1],
                block[byte_index + 2],
                block[byte_index + 3],
            ]);
        }
        for word_index in 16..64 {
            let small_sigma_zero = message_schedule[word_index - 15].rotate_right(7)
                ^ message_schedule[word_index - 15].rotate_right(18)
                ^ (message_schedule[word_index - 15] >> 3);
            let small_sigma_one = message_schedule[word_index - 2].rotate_right(17)
                ^ message_schedule[word_index - 2].rotate_right(19)
                ^ (message_schedule[word_index - 2] >> 10);
            message_schedule[word_index] = message_schedule[word_index - 16]
                .wrapping_add(small_sigma_zero)
                .wrapping_add(message_schedule[word_index - 7])
                .wrapping_add(small_sigma_one);
        }
        let mut a = self.state[0];
        let mut b = self.state[1];
        let mut c = self.state[2];
        let mut d = self.state[3];
        let mut e = self.state[4];
        let mut f = self.state[5];
        let mut g = self.state[6];
        let mut h = self.state[7];
        for round_index in 0..64 {
            let big_sigma_one = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let choice = (e & f) ^ (!e & g);
            let temporary_one = h
                .wrapping_add(big_sigma_one)
                .wrapping_add(choice)
                .wrapping_add(ROUND_CONSTANTS[round_index])
                .wrapping_add(message_schedule[round_index]);
            let big_sigma_zero = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let majority = (a & b) ^ (a & c) ^ (b & c);
            let temporary_two = big_sigma_zero.wrapping_add(majority);
            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(temporary_one);
            d = c;
            c = b;
            b = a;
            a = temporary_one.wrapping_add(temporary_two);
        }
        self.state[0] = self.state[0].wrapping_add(a);
        self.state[1] = self.state[1].wrapping_add(b);
        self.state[2] = self.state[2].wrapping_add(c);
        self.state[3] = self.state[3].wrapping_add(d);
        self.state[4] = self.state[4].wrapping_add(e);
        self.state[5] = self.state[5].wrapping_add(f);
        self.state[6] = self.state[6].wrapping_add(g);
        self.state[7] = self.state[7].wrapping_add(h);
    }
}

impl Default for Sha256 {
    fn default() -> Self {
        Self::new()
    }
}
