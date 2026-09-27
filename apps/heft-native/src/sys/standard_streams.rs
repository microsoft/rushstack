use std::ffi::{c_char, c_int};

const OPEN_FOR_READING_AND_WRITING: c_int = 2;
const NULL_DEVICE_PATH: &[u8] = b"/dev/null\0";
const STANDARD_STREAM_FILE_DESCRIPTORS: [c_int; 3] = [0, 1, 2];

extern "C" {
    fn open(path: *const c_char, flags: c_int, ...) -> c_int;
}

pub fn reopen_closed_standard_streams_on_the_null_device() {
    for file_descriptor in closed_standard_streams().into_iter().flatten() {
        let reopened_file_descriptor = unsafe {
            open(
                NULL_DEVICE_PATH.as_ptr().cast(),
                OPEN_FOR_READING_AND_WRITING,
            )
        };
        if reopened_file_descriptor != file_descriptor {
            return;
        }
    }
}

#[cfg(target_os = "linux")]
fn closed_standard_streams() -> [Option<c_int>; 3] {
    use std::ffi::{c_short, c_ulong};
    const POLL_INVALID_FILE_DESCRIPTOR: c_short = 0x20;
    #[repr(C)]
    struct PollFileDescriptor {
        file_descriptor: c_int,
        requested_events: c_short,
        returned_events: c_short,
    }
    extern "C" {
        fn poll(
            descriptors: *mut PollFileDescriptor,
            descriptor_count: c_ulong,
            timeout: c_int,
        ) -> c_int;
    }
    let mut standard_streams =
        STANDARD_STREAM_FILE_DESCRIPTORS.map(|file_descriptor| PollFileDescriptor {
            file_descriptor,
            requested_events: 0,
            returned_events: 0,
        });
    while unsafe { poll(standard_streams.as_mut_ptr(), 3, 0) } < 0 {
        if std::io::Error::last_os_error().kind() != std::io::ErrorKind::Interrupted {
            return closed_standard_streams_by_descriptor_flags();
        }
    }
    standard_streams.map(|standard_stream| {
        (standard_stream.returned_events & POLL_INVALID_FILE_DESCRIPTOR != 0)
            .then_some(standard_stream.file_descriptor)
    })
}

#[cfg(not(target_os = "linux"))]
fn closed_standard_streams() -> [Option<c_int>; 3] {
    closed_standard_streams_by_descriptor_flags()
}

fn closed_standard_streams_by_descriptor_flags() -> [Option<c_int>; 3] {
    const GET_FILE_DESCRIPTOR_FLAGS: c_int = 1;
    const BAD_FILE_DESCRIPTOR: i32 = 9;
    extern "C" {
        fn fcntl(file_descriptor: c_int, command: c_int, ...) -> c_int;
    }
    STANDARD_STREAM_FILE_DESCRIPTORS.map(|file_descriptor| {
        let descriptor_is_closed = unsafe { fcntl(file_descriptor, GET_FILE_DESCRIPTOR_FLAGS) }
            == -1
            && std::io::Error::last_os_error().raw_os_error() == Some(BAD_FILE_DESCRIPTOR);
        descriptor_is_closed.then_some(file_descriptor)
    })
}
