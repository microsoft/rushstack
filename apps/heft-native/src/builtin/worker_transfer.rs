use std::io::{Read, Write};

pub const ITEM_DONE_RECORD: u8 = 1;
pub const ITEM_FAILED_RECORD: u8 = 2;
pub const CHUNK_COMPLETE_RECORD: u8 = 3;

pub trait WorkerTransfer: Sized {
    fn append_to(&self, bytes: &mut Vec<u8>);
    fn take_from(bytes: &mut &[u8]) -> Option<Self>;
}

pub fn append_text(text: &str, bytes: &mut Vec<u8>) {
    bytes.extend_from_slice(&(text.len() as u64).to_le_bytes());
    bytes.extend_from_slice(text.as_bytes());
}

pub fn take_text(bytes: &mut &[u8]) -> Option<String> {
    let text_length = usize::try_from(u64::from_le_bytes(take_array(bytes)?)).ok()?;
    let (text_bytes, remaining_bytes) = bytes.split_at_checked(text_length)?;
    *bytes = remaining_bytes;
    String::from_utf8(text_bytes.to_vec()).ok()
}

pub fn take_array<const LENGTH: usize>(bytes: &mut &[u8]) -> Option<[u8; LENGTH]> {
    let (array, remaining_bytes) = bytes.split_first_chunk::<LENGTH>()?;
    *bytes = remaining_bytes;
    Some(*array)
}

impl WorkerTransfer for () {
    fn append_to(&self, _bytes: &mut Vec<u8>) {}

    fn take_from(_bytes: &mut &[u8]) -> Option<()> {
        Some(())
    }
}

impl WorkerTransfer for bool {
    fn append_to(&self, bytes: &mut Vec<u8>) {
        bytes.push(u8::from(*self));
    }

    fn take_from(bytes: &mut &[u8]) -> Option<bool> {
        take_array::<1>(bytes).map(|[byte]| byte != 0)
    }
}

impl WorkerTransfer for usize {
    fn append_to(&self, bytes: &mut Vec<u8>) {
        bytes.extend_from_slice(&(*self as u64).to_le_bytes());
    }

    fn take_from(bytes: &mut &[u8]) -> Option<usize> {
        usize::try_from(u64::from_le_bytes(take_array(bytes)?)).ok()
    }
}

impl<const LENGTH: usize> WorkerTransfer for [u8; LENGTH] {
    fn append_to(&self, bytes: &mut Vec<u8>) {
        bytes.extend_from_slice(self);
    }

    fn take_from(bytes: &mut &[u8]) -> Option<[u8; LENGTH]> {
        take_array(bytes)
    }
}

pub fn finish_worker_process((worker_process_id, mut results_reader): (i32, std::io::PipeReader)) -> Option<Vec<u8>> {
    let mut results = Vec::new();
    let results_were_read = results_reader.read_to_end(&mut results).is_ok();
    drop(results_reader);
    crate::sys::wait_for_worker_process(worker_process_id);
    results_were_read.then_some(results)
}

pub fn start_worker_process(run_chunk_in_worker: &mut dyn FnMut(&mut Vec<u8>)) -> Option<(i32, std::io::PipeReader)> {
    let (results_reader, mut results_writer) = std::io::pipe().ok()?;
    match crate::sys::fork_worker_process_of_this_single_threaded_process().ok()? {
        crate::sys::ForkedWorker::InParent { worker_process_id } => Some((worker_process_id, results_reader)),
        crate::sys::ForkedWorker::InWorker => {
            drop(results_reader);
            let mut results = Vec::new();
            run_chunk_in_worker(&mut results);
            results.push(CHUNK_COMPLETE_RECORD);
            let exit_status = if results_writer.write_all(&results).is_ok() { 0 } else { 1 };
            crate::sys::exit_worker_process_immediately(exit_status)
        }
    }
}
