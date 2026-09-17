#![windows_subsystem = "windows"]

use std::ffi::c_void;
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::ptr::{null, null_mut};
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU32, AtomicU64, AtomicU8, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use windows_sys::Win32::Foundation::{
    GetLastError, ERROR_ALREADY_EXISTS, HINSTANCE, HWND, LPARAM, LRESULT, POINT, WPARAM,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Threading::{CreateMutexW, CREATE_NO_WINDOW};
use windows_sys::Win32::UI::Shell::{
    Shell_NotifyIconW, NIF_ICON, NIF_MESSAGE, NIF_TIP, NIM_ADD, NIM_DELETE, NIM_MODIFY,
    NIM_SETVERSION, NOTIFYICONDATAW, NOTIFYICON_VERSION_4,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu,
    DispatchMessageW, GetCursorPos, GetMessageW, LoadIconW, PostMessageW, PostQuitMessage,
    RegisterClassW, RegisterWindowMessageW, SetForegroundWindow, SetTimer, TrackPopupMenu,
    TranslateMessage, CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, HMENU, IDI_APPLICATION,
    IDI_INFORMATION, IDI_WARNING, MF_DISABLED, MF_GRAYED, MF_SEPARATOR, MF_STRING, MSG,
    TPM_BOTTOMALIGN, TPM_RIGHTBUTTON, WM_APP, WM_COMMAND, WM_CONTEXTMENU, WM_DESTROY,
    WM_LBUTTONUP, WM_RBUTTONUP, WM_TIMER, WNDCLASSW, WS_OVERLAPPED,
};

const APP_NAME: &str = "Sourcream Monitor";
const HOST: &str = "127.0.0.1:25025";
const HEALTH_PATH: &str = "/api/health";
const CHECK_INTERVAL_MS: u32 = 10_000;
const REQUEST_TIMEOUT_MS: u64 = 700;

const TRAY_ID: u32 = 1;
const TIMER_ID: usize = 1;
const WM_TRAY: u32 = WM_APP + 1;
const WM_HEALTH_RESULT: u32 = WM_APP + 2;

const CMD_START: usize = 1001;
const CMD_OPEN: usize = 1002;
const CMD_LOGS: usize = 1003;
const CMD_EXIT: usize = 1004;

const OFFLINE: u8 = 0;
const ONLINE: u8 = 1;
const STARTING: u8 = 2;

static WINDOW: AtomicIsize = AtomicIsize::new(0);
static STATUS: AtomicU8 = AtomicU8::new(OFFLINE);
static CHECK_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
static STARTED_AT_MS: AtomicU64 = AtomicU64::new(0);
static TASKBAR_CREATED_MESSAGE: AtomicU32 = AtomicU32::new(0);

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}

fn copy_wide<const N: usize>(destination: &mut [u16; N], value: &str) {
    let encoded = value.encode_utf16().take(N - 1);
    for (slot, character) in destination.iter_mut().zip(encoded) {
        *slot = character;
    }
}

fn project_root() -> PathBuf {
    if let Ok(executable) = std::env::current_exe() {
        if let Some(dist) = executable.parent() {
            if dist.file_name().and_then(|name| name.to_str()) == Some("dist") {
                if let Some(root) = dist.parent().and_then(Path::parent) {
                    if root.join("package.json").is_file() {
                        return root.to_path_buf();
                    }
                }
            }
        }
    }

    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("tray directory must be inside the Sourcream project")
        .to_path_buf()
}

fn log_path() -> PathBuf {
    project_root().join(r"tray\sourcream-server.log")
}

fn node_path() -> PathBuf {
    let standard = PathBuf::from(r"C:\Program Files\nodejs\node.exe");
    if standard.is_file() {
        standard
    } else {
        PathBuf::from("node.exe")
    }
}

fn http_status(path: &str) -> Option<u16> {
    let address: SocketAddr = match HOST.parse() {
        Ok(address) => address,
        Err(_) => return None,
    };
    let timeout = Duration::from_millis(REQUEST_TIMEOUT_MS);
    let mut stream = match TcpStream::connect_timeout(&address, timeout) {
        Ok(stream) => stream,
        Err(_) => return None,
    };
    let _ = stream.set_read_timeout(Some(timeout));
    let _ = stream.set_write_timeout(Some(timeout));

    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: {HOST}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return None;
    }

    let mut response = [0_u8; 64];
    let read = match stream.read(&mut response) {
        Ok(read) => read,
        Err(_) => return None,
    };
    let status_line = String::from_utf8_lossy(&response[..read]);
    status_line
        .split_whitespace()
        .nth(1)
        .and_then(|status| status.parse().ok())
}

fn server_is_live() -> bool {
    match http_status(HEALTH_PATH) {
        Some(200 | 204) => true,
        // A server started from a build made before the health route was added.
        Some(404) => matches!(http_status("/"), Some(200)),
        _ => false,
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn request_health_check() {
    if CHECK_IN_PROGRESS.swap(true, Ordering::AcqRel) {
        return;
    }

    std::thread::spawn(|| {
        let online = server_is_live();
        CHECK_IN_PROGRESS.store(false, Ordering::Release);
        let hwnd = WINDOW.load(Ordering::Acquire) as HWND;
        if !hwnd.is_null() {
            unsafe {
                PostMessageW(hwnd, WM_HEALTH_RESULT, usize::from(online), 0);
            }
        }
    });
}

fn launch_server() -> Result<(), String> {
    let root = project_root();
    let next = root.join(r"node_modules\next\dist\bin\next");
    if !next.is_file() {
        return Err("Next.js is not installed. Run npm install first.".into());
    }
    if !root.join(r".next\BUILD_ID").is_file() {
        return Err("No production build was found. Run npm run build first.".into());
    }

    let log = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(log_path())
        .map_err(|error| format!("Could not open the server log: {error}"))?;
    let error_log = log
        .try_clone()
        .map_err(|error| format!("Could not open the server log: {error}"))?;

    Command::new(node_path())
        .arg(next)
        .args(["start", "--hostname", "0.0.0.0", "--port", "25025"])
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(error_log))
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("Could not start Sourcream: {error}"))?;

    Ok(())
}

fn wait_for_startup() {
    std::thread::spawn(|| {
        for _ in 0..20 {
            std::thread::sleep(Duration::from_millis(500));
            if server_is_live() {
                let hwnd = WINDOW.load(Ordering::Acquire) as HWND;
                if !hwnd.is_null() {
                    unsafe {
                        PostMessageW(hwnd, WM_HEALTH_RESULT, 1, 0);
                    }
                }
                return;
            }
        }

        let hwnd = WINDOW.load(Ordering::Acquire) as HWND;
        if !hwnd.is_null() {
            unsafe {
                // 2 distinguishes a completed startup timeout from an ordinary failed poll.
                PostMessageW(hwnd, WM_HEALTH_RESULT, 2, 0);
            }
        }
    });
}

fn start_server() -> Result<(), String> {
    STATUS.store(STARTING, Ordering::Release);
    STARTED_AT_MS.store(now_ms(), Ordering::Release);
    update_tray();

    match launch_server() {
        Ok(()) => {
            wait_for_startup();
            Ok(())
        }
        Err(error) => {
            STATUS.store(OFFLINE, Ordering::Release);
            update_tray();
            Err(error)
        }
    }
}

fn open_url() {
    let _ = Command::new("explorer.exe")
        .arg("http://localhost:25025")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}

fn open_logs() {
    let path = log_path();
    if !path.exists() {
        let _ = OpenOptions::new().create(true).append(true).open(&path);
    }
    let _ = Command::new("notepad.exe")
        .arg(path)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}

fn show_error(message: &str) {
    let title = wide(APP_NAME);
    let message = wide(message);
    unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW(
            WINDOW.load(Ordering::Acquire) as HWND,
            message.as_ptr(),
            title.as_ptr(),
            windows_sys::Win32::UI::WindowsAndMessaging::MB_OK
                | windows_sys::Win32::UI::WindowsAndMessaging::MB_ICONERROR,
        );
    }
}

fn status_label() -> &'static str {
    match STATUS.load(Ordering::Acquire) {
        ONLINE => "Sourcream — Running",
        STARTING => "Sourcream — Starting…",
        _ => "Sourcream — Offline",
    }
}

unsafe fn status_icon() -> windows_sys::Win32::UI::WindowsAndMessaging::HICON {
    let icon = match STATUS.load(Ordering::Acquire) {
        ONLINE => IDI_INFORMATION,
        STARTING => IDI_WARNING,
        _ => IDI_APPLICATION,
    };
    LoadIconW(0 as HINSTANCE, icon)
}

fn tray_data(hwnd: HWND) -> NOTIFYICONDATAW {
    let mut data: NOTIFYICONDATAW = unsafe { std::mem::zeroed() };
    data.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
    data.hWnd = hwnd;
    data.uID = TRAY_ID;
    data.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
    data.uCallbackMessage = WM_TRAY;
    data.hIcon = unsafe { status_icon() };
    copy_wide(&mut data.szTip, status_label());
    data
}

fn add_tray_icon() {
    let hwnd = WINDOW.load(Ordering::Acquire) as HWND;
    let mut data = tray_data(hwnd);
    unsafe {
        Shell_NotifyIconW(NIM_ADD, &mut data);
        data.Anonymous.uVersion = NOTIFYICON_VERSION_4;
        Shell_NotifyIconW(NIM_SETVERSION, &mut data);
    }
}

fn update_tray() {
    let hwnd = WINDOW.load(Ordering::Acquire) as HWND;
    if hwnd.is_null() {
        return;
    }
    let mut data = tray_data(hwnd);
    unsafe {
        Shell_NotifyIconW(NIM_MODIFY, &mut data);
    }
}

fn remove_tray_icon() {
    let hwnd = WINDOW.load(Ordering::Acquire) as HWND;
    let mut data = tray_data(hwnd);
    unsafe {
        Shell_NotifyIconW(NIM_DELETE, &mut data);
    }
}

fn show_menu(hwnd: HWND) {
    unsafe {
        let menu: HMENU = CreatePopupMenu();
        if menu.is_null() {
            return;
        }

        let status = wide(status_label());
        let open = wide("Open Sourcream");
        let start = wide("Start Sourcream");
        let logs = wide("Open Logs");
        let exit = wide("Exit Monitor");

        AppendMenuW(menu, MF_STRING | MF_DISABLED | MF_GRAYED, 0, status.as_ptr());
        AppendMenuW(menu, MF_SEPARATOR, 0, null());
        AppendMenuW(menu, MF_STRING, CMD_OPEN, open.as_ptr());
        let start_flags = if STATUS.load(Ordering::Acquire) == OFFLINE {
            MF_STRING
        } else {
            MF_STRING | MF_DISABLED | MF_GRAYED
        };
        AppendMenuW(menu, start_flags, CMD_START, start.as_ptr());
        AppendMenuW(menu, MF_STRING, CMD_LOGS, logs.as_ptr());
        AppendMenuW(menu, MF_SEPARATOR, 0, null());
        AppendMenuW(menu, MF_STRING, CMD_EXIT, exit.as_ptr());

        let mut point = POINT { x: 0, y: 0 };
        GetCursorPos(&mut point);
        SetForegroundWindow(hwnd);
        TrackPopupMenu(
            menu,
            TPM_BOTTOMALIGN | TPM_RIGHTBUTTON,
            point.x,
            point.y,
            0,
            hwnd,
            null(),
        );
        DestroyMenu(menu);
    }
}

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if message == WM_TRAY {
        let event = (lparam as u32) & 0xffff;
        if event == WM_CONTEXTMENU || event == WM_RBUTTONUP || event == WM_LBUTTONUP {
            show_menu(hwnd);
        }
        return 0;
    }

    if message == WM_HEALTH_RESULT {
        let status = if wparam == 1 {
            ONLINE
        } else if wparam == 2 {
            OFFLINE
        } else if STATUS.load(Ordering::Acquire) == STARTING
            && now_ms().saturating_sub(STARTED_AT_MS.load(Ordering::Acquire)) < 15_000
        {
            STARTING
        } else {
            OFFLINE
        };
        STATUS.store(status, Ordering::Release);
        update_tray();
        return 0;
    }

    let taskbar_created = TASKBAR_CREATED_MESSAGE.load(Ordering::Acquire);
    if taskbar_created != 0 && message == taskbar_created {
        add_tray_icon();
        return 0;
    }

    match message {
        WM_TIMER if wparam == TIMER_ID => {
            request_health_check();
            0
        }
        WM_COMMAND => {
            match wparam & 0xffff {
                CMD_START => {
                    if STATUS.load(Ordering::Acquire) == OFFLINE {
                        if let Err(error) = start_server() {
                            show_error(&error);
                        }
                    }
                }
                CMD_OPEN => open_url(),
                CMD_LOGS => open_logs(),
                CMD_EXIT => {
                    remove_tray_icon();
                    PostQuitMessage(0);
                }
                _ => {}
            }
            0
        }
        WM_DESTROY => {
            remove_tray_icon();
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, message, wparam, lparam),
    }
}

fn run() -> Result<(), String> {
    let mutex_name = wide("Local\\SourcreamTrayMonitor");
    let instance_mutex = unsafe { CreateMutexW(null(), 0, mutex_name.as_ptr()) };
    if instance_mutex.is_null() {
        return Err("Could not create the single-instance lock.".into());
    }
    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        return Ok(());
    }

    let module = unsafe { GetModuleHandleW(null()) };
    if module.is_null() {
        return Err("Could not load the application module.".into());
    }

    let class_name = wide("SourcreamTrayWindow");
    let window_class = WNDCLASSW {
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(window_proc),
        cbClsExtra: 0,
        cbWndExtra: 0,
        hInstance: module,
        hIcon: unsafe { LoadIconW(0 as HINSTANCE, IDI_APPLICATION) },
        hCursor: null_mut(),
        hbrBackground: null_mut(),
        lpszMenuName: null(),
        lpszClassName: class_name.as_ptr(),
    };
    if unsafe { RegisterClassW(&window_class) } == 0 {
        return Err("Could not register the tray window.".into());
    }

    let hwnd = unsafe {
        CreateWindowExW(
            0,
            class_name.as_ptr(),
            wide(APP_NAME).as_ptr(),
            WS_OVERLAPPED,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            0 as HWND,
            0 as HMENU,
            module,
            null::<c_void>(),
        )
    };
    if hwnd.is_null() {
        return Err("Could not create the tray window.".into());
    }
    WINDOW.store(hwnd as isize, Ordering::Release);

    let taskbar_message = unsafe { RegisterWindowMessageW(wide("TaskbarCreated").as_ptr()) };
    TASKBAR_CREATED_MESSAGE.store(taskbar_message, Ordering::Release);

    add_tray_icon();
    unsafe {
        SetTimer(hwnd, TIMER_ID, CHECK_INTERVAL_MS, None);
    }
    request_health_check();

    let mut message: MSG = unsafe { std::mem::zeroed() };
    while unsafe { GetMessageW(&mut message, 0 as HWND, 0, 0) } > 0 {
        unsafe {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }

    // Keep the mutex alive until the message loop exits.
    let _ = instance_mutex;
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        show_error(&error);
    }
}
