use std::ffi::c_int;
use std::os::fd::AsRawFd;
use std::os::unix::net::UnixStream;
use std::sync::atomic::{AtomicI32, Ordering};

const SIGNAL_INTERRUPT: c_int = 2;
const SIGNAL_TERMINATE: c_int = 15;
const DEFAULT_SIGNAL_DISPOSITION: usize = 0;
const WARM_HOST_SIGNAL_FRAME_TYPE: u8 = 0x02;
const EXIT_CODE_AFTER_SIGNAL_OFFSET: i32 = 128;

static WARM_HOST_SOCKET_FILE_DESCRIPTOR: AtomicI32 = AtomicI32::new(-1);
static SIGNAL_FORWARDED_TO_WARM_HOST: AtomicI32 = AtomicI32::new(0);

extern "C" {
    fn geteuid() -> u32;
    fn signal(signal_number: c_int, handler: usize) -> usize;
    fn raise(signal_number: c_int) -> c_int;
    fn write(file_descriptor: c_int, buffer: *const u8, byte_count: usize) -> isize;
}

pub fn effective_user_id() -> u32 {
    unsafe { geteuid() }
}

extern "C" fn forward_signal_to_warm_host(signal_number: c_int) {
    SIGNAL_FORWARDED_TO_WARM_HOST.store(signal_number, Ordering::SeqCst);
    let socket_file_descriptor = WARM_HOST_SOCKET_FILE_DESCRIPTOR.load(Ordering::SeqCst);
    if socket_file_descriptor >= 0 {
        let signal_frame: [u8; 6] = [1, 0, 0, 0, WARM_HOST_SIGNAL_FRAME_TYPE, signal_number as u8];
        unsafe {
            write(
                socket_file_descriptor,
                signal_frame.as_ptr(),
                signal_frame.len(),
            )
        };
    }
}

pub fn forward_interrupt_and_termination_signals_to_warm_host(warm_host_socket: &UnixStream) {
    WARM_HOST_SOCKET_FILE_DESCRIPTOR.store(warm_host_socket.as_raw_fd(), Ordering::SeqCst);
    let handler = forward_signal_to_warm_host as extern "C" fn(c_int) as usize;
    for signal_number in [SIGNAL_INTERRUPT, SIGNAL_TERMINATE] {
        unsafe { signal(signal_number, handler) };
    }
}

pub fn signal_forwarded_to_warm_host() -> Option<i32> {
    match SIGNAL_FORWARDED_TO_WARM_HOST.load(Ordering::SeqCst) {
        0 => None,
        signal_number => Some(signal_number),
    }
}

pub fn terminate_by_signal(signal_number: i32) -> ! {
    unsafe {
        signal(signal_number, DEFAULT_SIGNAL_DISPOSITION);
        raise(signal_number);
    }
    std::process::exit(EXIT_CODE_AFTER_SIGNAL_OFFSET + signal_number)
}
