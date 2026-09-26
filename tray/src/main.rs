#![windows_subsystem = "windows"]

use std::ffi::c_void;
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::ptr::{null, null_mut};
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU32, AtomicU64, AtomicU8, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use windows_sys::Win32::Foundation::{
    GetLastError, ERROR_ALREADY_EXISTS, ERROR_BUFFER_OVERFLOW, HINSTANCE, HWND, LPARAM, LRESULT,
    POINT, WPARAM,
};
use windows_sys::Win32::NetworkManagement::IpHelper::{
    GetAdaptersAddresses, GAA_FLAG_INCLUDE_GATEWAYS, GAA_FLAG_SKIP_ANYCAST,
    GAA_FLAG_SKIP_DNS_SERVER, GAA_FLAG_SKIP_MULTICAST, IF_TYPE_SOFTWARE_LOOPBACK, IF_TYPE_TUNNEL,
    IP_ADAPTER_ADDRESSES_LH,
};
use windows_sys::Win32::NetworkManagement::Ndis::IfOperStatusUp;
use windows_sys::Win32::Networking::WinSock::{AF_INET, SOCKADDR_IN};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Threading::{CreateMutexW, CREATE_NO_WINDOW};
use windows_sys::Win32::UI::Shell::{
    ShellExecuteW, Shell_NotifyIconW, NIF_ICON, NIF_MESSAGE, NIF_TIP, NIM_ADD, NIM_DELETE,
    NIM_MODIFY, NIM_SETVERSION, NOTIFYICONDATAW, NOTIFYICON_VERSION_4,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu, DispatchMessageW,
    GetCursorPos, GetMessageW, LoadIconW, LoadImageW, MessageBoxW, PostMessageW, PostQuitMessage,
    RegisterClassW, RegisterWindowMessageW, SetForegroundWindow, SetTimer, TrackPopupMenu,
    TranslateMessage, CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, HMENU, IDI_APPLICATION, IMAGE_ICON,
    LR_DEFAULTSIZE, LR_LOADFROMFILE, MB_ICONERROR, MB_ICONINFORMATION, MB_OK, MF_DISABLED,
    MF_GRAYED, MF_SEPARATOR, MF_STRING, MSG, SW_HIDE, TPM_BOTTOMALIGN, TPM_RIGHTBUTTON, WM_APP,
    WM_COMMAND, WM_CONTEXTMENU, WM_DESTROY, WM_LBUTTONUP, WM_RBUTTONUP, WM_TIMER, WNDCLASSW,
    WS_OVERLAPPED,
};

const APP_NAME: &str = "Sourcream";
const SOURCREAM_HOST: &str = "127.0.0.1:10010";
const SOURCREAM_HEALTH_PATH: &str = "/api/health";
const CHECK_INTERVAL_MS: u32 = 10_000;
const SOURCREAM_TIMEOUT_MS: u64 = 700;
const TUNNEL_TIMEOUT_MS: u64 = 200;

const TRAY_ID: u32 = 1;
const TIMER_ID: usize = 1;
const WM_TRAY: u32 = WM_APP + 1;
const WM_SOURCREAM_RESULT: u32 = WM_APP + 2;
const WM_TUNNEL_RESULT: u32 = WM_APP + 3;
const WM_PAUSE_RESULT: u32 = WM_APP + 4;
const WM_ACTION_ERROR: u32 = WM_APP + 5;
const WM_LAN_RESULT: u32 = WM_APP + 6;

const CMD_PAUSE_SOURCREAM: usize = 1001;
const CMD_RESTART_SOURCREAM: usize = 1002;
const CMD_RESTART_TUNNEL: usize = 1003;
const CMD_SHOW_APP: usize = 1004;
const CMD_SHOW_LOGS: usize = 1005;
const CMD_ABOUT: usize = 1006;
const CMD_EXIT: usize = 1007;
const CMD_SHOW_APP_PUBLIC: usize = 1008;
const CMD_COPY_LAN_URL: usize = 1009;

const PAUSED: u8 = 0;
const READY: u8 = 1;
const RESTARTING: u8 = 2;
const PAUSING: u8 = 3;
const NOT_READY: u8 = 0;

static WINDOW: AtomicIsize = AtomicIsize::new(0);
static SOURCREAM_STATUS: AtomicU8 = AtomicU8::new(PAUSED);
static TUNNEL_STATUS: AtomicU8 = AtomicU8::new(NOT_READY);
static CHECK_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
static SOURCREAM_ACTION_AT_MS: AtomicU64 = AtomicU64::new(0);
static TUNNEL_ACTION_AT_MS: AtomicU64 = AtomicU64::new(0);
static TASKBAR_CREATED_MESSAGE: AtomicU32 = AtomicU32::new(0);
static ACTION_ERROR: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static LAN_IP: OnceLock<Mutex<Option<Ipv4Addr>>> = OnceLock::new();
static READY_ICON: AtomicIsize = AtomicIsize::new(0);
static BUSY_ICON: AtomicIsize = AtomicIsize::new(0);
static PAUSED_ICON: AtomicIsize = AtomicIsize::new(0);
static ERROR_ICON: AtomicIsize = AtomicIsize::new(0);

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}

fn copy_wide<const N: usize>(destination: &mut [u16; N], value: &str) {
    let encoded = value.encode_utf16().take(N - 1);
    for (slot, character) in destination.iter_mut().zip(encoded) {
        *slot = character;
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn current_lan_ip() -> Option<Ipv4Addr> {
    // GetAdaptersAddresses needs an aligned buffer and can report a larger size on retry.
    let mut buffer = vec![0_u64; 2048];
    let flags = GAA_FLAG_INCLUDE_GATEWAYS
        | GAA_FLAG_SKIP_ANYCAST
        | GAA_FLAG_SKIP_MULTICAST
        | GAA_FLAG_SKIP_DNS_SERVER;
    for _ in 0..3 {
        let mut bytes = (buffer.len() * std::mem::size_of::<u64>()) as u32;
        let result = unsafe {
            GetAdaptersAddresses(
                AF_INET as u32,
                flags,
                null(),
                buffer.as_mut_ptr().cast::<IP_ADAPTER_ADDRESSES_LH>(),
                &mut bytes,
            )
        };
        if result == ERROR_BUFFER_OVERFLOW {
            buffer.resize((bytes as usize).div_ceil(8), 0);
            continue;
        }
        if result != 0 {
            return None;
        }

        let mut adapter = buffer.as_ptr().cast::<IP_ADAPTER_ADDRESSES_LH>();
        let mut best: Option<(bool, u32, Ipv4Addr)> = None;
        while !adapter.is_null() {
            let entry = unsafe { &*adapter };
            if entry.OperStatus == IfOperStatusUp
                && entry.IfType != IF_TYPE_SOFTWARE_LOOPBACK
                && entry.IfType != IF_TYPE_TUNNEL
            {
                let mut address = entry.FirstUnicastAddress;
                while !address.is_null() {
                    let socket = unsafe { (*address).Address.lpSockaddr };
                    if !socket.is_null() && unsafe { (*socket).sa_family } == AF_INET {
                        let ipv4 = unsafe { &*(socket as *const SOCKADDR_IN) };
                        let octets = unsafe { ipv4.sin_addr.S_un.S_un_b };
                        let ip = Ipv4Addr::new(octets.s_b1, octets.s_b2, octets.s_b3, octets.s_b4);
                        if ip.is_private() {
                            let has_gateway = !entry.FirstGatewayAddress.is_null();
                            let candidate = (has_gateway, entry.Ipv4Metric, ip);
                            if best.is_none_or(|(gateway, metric, _)| {
                                has_gateway > gateway
                                    || (has_gateway == gateway && entry.Ipv4Metric < metric)
                            }) {
                                best = Some(candidate);
                            }
                        }
                    }
                    address = unsafe { (*address).Next };
                }
            }
            adapter = entry.Next;
        }
        return best.map(|(_, _, ip)| ip);
    }
    None
}

fn cached_lan_ip() -> Option<Ipv4Addr> {
    LAN_IP
        .get()
        .and_then(|slot| slot.lock().ok().and_then(|ip| *ip))
}

fn lan_url() -> Option<String> {
    cached_lan_ip().map(|ip| format!("http://{ip}:10010"))
}

fn refresh_lan_ip() {
    let ip = current_lan_ip();
    let slot = LAN_IP.get_or_init(|| Mutex::new(None));
    if let Ok(mut current) = slot.lock() {
        *current = ip;
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

fn icon_path(filename: &str) -> PathBuf {
    if let Ok(executable) = std::env::current_exe() {
        if let Some(directory) = executable.parent() {
            let installed = directory.join("assets").join(filename);
            if installed.is_file() {
                return installed;
            }
        }
    }

    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("assets")
        .join(filename)
}

fn node_path() -> PathBuf {
    let standard = PathBuf::from(r"C:\Program Files\nodejs\node.exe");
    if standard.is_file() {
        standard
    } else {
        PathBuf::from("node.exe")
    }
}

fn http_status(host: &str, path: &str, timeout_ms: u64) -> Option<u16> {
    let address: SocketAddr = host.parse().ok()?;
    let timeout = Duration::from_millis(timeout_ms);
    let mut stream = TcpStream::connect_timeout(&address, timeout).ok()?;
    let _ = stream.set_read_timeout(Some(timeout));
    let _ = stream.set_write_timeout(Some(timeout));

    let request = format!("GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n");
    stream.write_all(request.as_bytes()).ok()?;

    let mut response = [0_u8; 64];
    let read = stream.read(&mut response).ok()?;
    String::from_utf8_lossy(&response[..read])
        .split_whitespace()
        .nth(1)
        .and_then(|status| status.parse().ok())
}

fn sourcream_is_ready() -> bool {
    match http_status(SOURCREAM_HOST, SOURCREAM_HEALTH_PATH, SOURCREAM_TIMEOUT_MS) {
        Some(200 | 204) => true,
        Some(404) => matches!(
            http_status(SOURCREAM_HOST, "/", SOURCREAM_TIMEOUT_MS),
            Some(200)
        ),
        _ => false,
    }
}

fn tunnel_is_ready() -> bool {
    (20241..=20245).any(|port| {
        let host = format!("127.0.0.1:{port}");
        matches!(http_status(&host, "/ready", TUNNEL_TIMEOUT_MS), Some(200))
    })
}

fn post_window_message(message: u32, value: usize) {
    let hwnd = WINDOW.load(Ordering::Acquire) as HWND;
    if !hwnd.is_null() {
        unsafe {
            PostMessageW(hwnd, message, value, 0);
        }
    }
}

fn request_health_check() {
    if CHECK_IN_PROGRESS.swap(true, Ordering::AcqRel) {
        return;
    }

    std::thread::spawn(|| {
        let sourcream_ready = sourcream_is_ready();
        let tunnel_ready = tunnel_is_ready();
        CHECK_IN_PROGRESS.store(false, Ordering::Release);
        post_window_message(WM_SOURCREAM_RESULT, usize::from(sourcream_ready));
        post_window_message(WM_TUNNEL_RESULT, usize::from(tunnel_ready));
    });
}

fn request_lan_check() {
    std::thread::spawn(|| {
        refresh_lan_ip();
        post_window_message(WM_LAN_RESULT, 0);
    });
}

fn launch_server() -> Result<(), String> {
    let root = project_root();
    let next = root.join(r"node_modules\next\dist\bin\next");
    if !next.is_file() {
        return Err("Next.js is not installed. Run npm install first.".into());
    }
    if !root.join(r".next-prod\BUILD_ID").is_file() {
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
        .args(["start", "--hostname", "0.0.0.0", "--port", "10010"])
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(error_log))
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("Could not start Sourcream: {error}"))?;

    Ok(())
}

fn listener_pid() -> Result<Option<u32>, String> {
    let output = Command::new("netstat.exe")
        .args(["-ano", "-p", "tcp"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("Could not inspect Sourcream's port: {error}"))?;

    if !output.status.success() {
        return Err("Windows could not inspect Sourcream's port.".into());
    }

    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let columns: Vec<_> = line.split_whitespace().collect();
        if columns.len() >= 5
            && columns[0].eq_ignore_ascii_case("TCP")
            && columns[1].rsplit(':').next() == Some("10010")
            && columns[3].eq_ignore_ascii_case("LISTENING")
        {
            if let Ok(pid) = columns[4].parse() {
                return Ok(Some(pid));
            }
        }
    }

    Ok(None)
}

fn stop_server() -> Result<(), String> {
    if let Some(pid) = listener_pid()? {
        if pid == std::process::id() {
            return Err("Refusing to stop the tray monitor itself.".into());
        }

        let output = Command::new("taskkill.exe")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|error| format!("Could not stop Sourcream: {error}"))?;

        if !output.status.success() && sourcream_is_ready() {
            return Err("Windows could not stop the Sourcream server.".into());
        }
    }

    for _ in 0..30 {
        if !sourcream_is_ready() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(100));
    }

    Err("Sourcream did not stop within three seconds.".into())
}

fn wait_for_startup() {
    std::thread::spawn(|| {
        for _ in 0..20 {
            std::thread::sleep(Duration::from_millis(500));
            if sourcream_is_ready() {
                post_window_message(WM_SOURCREAM_RESULT, 1);
                return;
            }
        }
        post_window_message(WM_SOURCREAM_RESULT, 2);
    });
}

fn report_action_error(error: String) {
    let slot = ACTION_ERROR.get_or_init(|| Mutex::new(None));
    if let Ok(mut pending) = slot.lock() {
        *pending = Some(error);
    }
    post_window_message(WM_ACTION_ERROR, 0);
}

fn pause_sourcream() {
    if SOURCREAM_STATUS.load(Ordering::Acquire) != READY {
        return;
    }

    SOURCREAM_STATUS.store(PAUSING, Ordering::Release);
    update_tray();
    std::thread::spawn(|| match stop_server() {
        Ok(()) => post_window_message(WM_PAUSE_RESULT, 1),
        Err(error) => report_action_error(error),
    });
}

fn restart_sourcream() {
    if matches!(
        SOURCREAM_STATUS.load(Ordering::Acquire),
        RESTARTING | PAUSING
    ) {
        return;
    }

    SOURCREAM_STATUS.store(RESTARTING, Ordering::Release);
    SOURCREAM_ACTION_AT_MS.store(now_ms(), Ordering::Release);
    update_tray();

    std::thread::spawn(|| {
        let result = if sourcream_is_ready() {
            stop_server().and_then(|()| launch_server())
        } else {
            launch_server()
        };

        match result {
            Ok(()) => wait_for_startup(),
            Err(error) => report_action_error(error),
        }
    });
}

fn restart_tunnel() -> Result<(), String> {
    if TUNNEL_STATUS.load(Ordering::Acquire) == RESTARTING {
        return Ok(());
    }

    let operation = wide("runas");
    let executable = wide("powershell.exe");
    let parameters = wide(
        "-NoProfile -NonInteractive -WindowStyle Hidden -Command \"Restart-Service -Name 'Cloudflared' -Force\"",
    );
    let result = unsafe {
        ShellExecuteW(
            WINDOW.load(Ordering::Acquire) as HWND,
            operation.as_ptr(),
            executable.as_ptr(),
            parameters.as_ptr(),
            null(),
            SW_HIDE,
        )
    };

    if result as isize <= 32 {
        return Err("Windows could not request the Cloudflare Tunnel restart.".into());
    }

    TUNNEL_STATUS.store(RESTARTING, Ordering::Release);
    TUNNEL_ACTION_AT_MS.store(now_ms(), Ordering::Release);
    update_tray();
    Ok(())
}

fn open_url(url: &str) {
    let _ = Command::new("explorer.exe")
        .arg(url)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}

fn copy_lan_url() {
    let Some(url) = lan_url() else { return };
    let result = Command::new("clip.exe")
        .stdin(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .and_then(|mut child| {
            if let Some(mut input) = child.stdin.take() {
                input.write_all(url.as_bytes())?;
            }
            child.wait()
        });
    if !result.is_ok_and(|status| status.success()) {
        show_error("Could not copy the LAN URL to the clipboard.");
    }
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

fn show_message(message: &str, icon: u32) {
    let title = wide(APP_NAME);
    let message = wide(message);
    unsafe {
        MessageBoxW(
            WINDOW.load(Ordering::Acquire) as HWND,
            message.as_ptr(),
            title.as_ptr(),
            MB_OK | icon,
        );
    }
}

fn show_error(message: &str) {
    show_message(message, MB_ICONERROR);
}

fn show_about() {
    show_message(
        "Sourcream\n\nWatch local media on your TV.",
        MB_ICONINFORMATION,
    );
}

fn sourcream_label() -> &'static str {
    match SOURCREAM_STATUS.load(Ordering::Acquire) {
        READY => "Sourcream (Ready)",
        RESTARTING => "Sourcream (Restarting…)",
        PAUSING => "Sourcream (Pausing…)",
        _ => "Sourcream (Paused)",
    }
}

fn tunnel_label() -> &'static str {
    match TUNNEL_STATUS.load(Ordering::Acquire) {
        READY => "Tunnel (Ready)",
        RESTARTING => "Tunnel (Restarting…)",
        _ => "Tunnel (Not Ready)",
    }
}

unsafe fn load_status_icon(
    slot: &AtomicIsize,
    filename: &str,
) -> windows_sys::Win32::UI::WindowsAndMessaging::HICON {
    let cached = slot.load(Ordering::Acquire);
    if cached != 0 {
        return cached as _;
    }

    let path = wide(&icon_path(filename).to_string_lossy());
    let loaded = LoadImageW(
        0 as HINSTANCE,
        path.as_ptr(),
        IMAGE_ICON,
        0,
        0,
        LR_LOADFROMFILE | LR_DEFAULTSIZE,
    ) as isize;
    let icon = if loaded == 0 {
        LoadIconW(0 as HINSTANCE, IDI_APPLICATION) as isize
    } else {
        loaded
    };
    slot.store(icon, Ordering::Release);
    icon as _
}

unsafe fn status_icon() -> windows_sys::Win32::UI::WindowsAndMessaging::HICON {
    let sourcream = SOURCREAM_STATUS.load(Ordering::Acquire);
    let tunnel = TUNNEL_STATUS.load(Ordering::Acquire);
    if matches!(sourcream, RESTARTING | PAUSING) || tunnel == RESTARTING {
        load_status_icon(&BUSY_ICON, "status-busy.ico")
    } else if tunnel != READY {
        load_status_icon(&ERROR_ICON, "status-error.ico")
    } else if sourcream == READY {
        load_status_icon(&READY_ICON, "status-ready.ico")
    } else {
        load_status_icon(&PAUSED_ICON, "status-paused.ico")
    }
}

fn tray_data(hwnd: HWND) -> NOTIFYICONDATAW {
    let mut data: NOTIFYICONDATAW = unsafe { std::mem::zeroed() };
    data.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
    data.hWnd = hwnd;
    data.uID = TRAY_ID;
    data.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
    data.uCallbackMessage = WM_TRAY;
    data.hIcon = unsafe { status_icon() };
    copy_wide(
        &mut data.szTip,
        &format!(
            "{} | {} | {}",
            sourcream_label(),
            tunnel_label(),
            lan_url().unwrap_or_else(|| "LAN IP unavailable".into())
        ),
    );
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

fn disabled_when(disabled: bool) -> u32 {
    if disabled {
        MF_STRING | MF_DISABLED | MF_GRAYED
    } else {
        MF_STRING
    }
}

fn show_menu(hwnd: HWND) {
    refresh_lan_ip();
    update_tray();
    unsafe {
        let menu: HMENU = CreatePopupMenu();
        if menu.is_null() {
            return;
        }

        let sourcream = wide(sourcream_label());
        let pause = wide("Pause Sourcream");
        let restart_sourcream_text = wide("Restart Sourcream");
        let tunnel = wide(tunnel_label());
        let restart_tunnel_text = wide("Restart Tunnel");
        let show_app_local = wide("Show App (Local)");
        let lan_label = wide(
            &cached_lan_ip()
                .map(|ip| format!("LAN ({ip}:10010)"))
                .unwrap_or_else(|| "LAN (IP unavailable)".into()),
        );
        let copy_lan_url = wide("Copy LAN URL");
        let show_app_public = wide("Show App (Public)");
        let show_logs = wide("Show Logs");
        let about = wide("About");
        let exit = wide("Exit");

        AppendMenuW(
            menu,
            MF_STRING | MF_DISABLED | MF_GRAYED,
            0,
            sourcream.as_ptr(),
        );
        AppendMenuW(
            menu,
            disabled_when(SOURCREAM_STATUS.load(Ordering::Acquire) != READY),
            CMD_PAUSE_SOURCREAM,
            pause.as_ptr(),
        );
        AppendMenuW(
            menu,
            disabled_when(matches!(
                SOURCREAM_STATUS.load(Ordering::Acquire),
                RESTARTING | PAUSING
            )),
            CMD_RESTART_SOURCREAM,
            restart_sourcream_text.as_ptr(),
        );
        AppendMenuW(menu, MF_SEPARATOR, 0, null());

        AppendMenuW(
            menu,
            MF_STRING | MF_DISABLED | MF_GRAYED,
            0,
            tunnel.as_ptr(),
        );
        AppendMenuW(
            menu,
            disabled_when(TUNNEL_STATUS.load(Ordering::Acquire) == RESTARTING),
            CMD_RESTART_TUNNEL,
            restart_tunnel_text.as_ptr(),
        );
        AppendMenuW(menu, MF_SEPARATOR, 0, null());

        AppendMenuW(menu, MF_STRING, CMD_SHOW_APP, show_app_local.as_ptr());
        AppendMenuW(
            menu,
            MF_STRING,
            CMD_SHOW_APP_PUBLIC,
            show_app_public.as_ptr(),
        );
        AppendMenuW(
            menu,
            MF_STRING | MF_DISABLED | MF_GRAYED,
            0,
            lan_label.as_ptr(),
        );
        AppendMenuW(
            menu,
            disabled_when(lan_url().is_none()),
            CMD_COPY_LAN_URL,
            copy_lan_url.as_ptr(),
        );
        AppendMenuW(menu, MF_STRING, CMD_SHOW_LOGS, show_logs.as_ptr());
        AppendMenuW(menu, MF_SEPARATOR, 0, null());

        AppendMenuW(menu, MF_STRING, CMD_ABOUT, about.as_ptr());
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

    if message == WM_SOURCREAM_RESULT {
        let current = SOURCREAM_STATUS.load(Ordering::Acquire);
        let status = if wparam == 1 {
            READY
        } else if wparam == 2 || current == PAUSING {
            PAUSED
        } else if current == RESTARTING
            && now_ms().saturating_sub(SOURCREAM_ACTION_AT_MS.load(Ordering::Acquire)) < 15_000
        {
            RESTARTING
        } else {
            PAUSED
        };
        SOURCREAM_STATUS.store(status, Ordering::Release);
        update_tray();
        return 0;
    }

    if message == WM_TUNNEL_RESULT {
        let current = TUNNEL_STATUS.load(Ordering::Acquire);
        let status = if wparam == 1 {
            READY
        } else if current == RESTARTING
            && now_ms().saturating_sub(TUNNEL_ACTION_AT_MS.load(Ordering::Acquire)) < 20_000
        {
            RESTARTING
        } else {
            NOT_READY
        };
        TUNNEL_STATUS.store(status, Ordering::Release);
        update_tray();
        return 0;
    }

    if message == WM_PAUSE_RESULT {
        SOURCREAM_STATUS.store(PAUSED, Ordering::Release);
        update_tray();
        return 0;
    }

    if message == WM_ACTION_ERROR {
        if let Some(slot) = ACTION_ERROR.get() {
            if let Ok(mut pending) = slot.lock() {
                if let Some(error) = pending.take() {
                    show_error(&error);
                }
            }
        }
        request_health_check();
        return 0;
    }

    if message == WM_LAN_RESULT {
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
                CMD_PAUSE_SOURCREAM => pause_sourcream(),
                CMD_RESTART_SOURCREAM => restart_sourcream(),
                CMD_RESTART_TUNNEL => {
                    if let Err(error) = restart_tunnel() {
                        show_error(&error);
                    }
                }
                CMD_SHOW_APP => open_url("http://localhost:10010"),
                CMD_COPY_LAN_URL => copy_lan_url(),
                CMD_SHOW_APP_PUBLIC => open_url("https://sourcream.kierb.com"),
                CMD_SHOW_LOGS => open_logs(),
                CMD_ABOUT => show_about(),
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
        hIcon: unsafe { load_status_icon(&READY_ICON, "status-ready.ico") },
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
    request_lan_check();

    let mut message: MSG = unsafe { std::mem::zeroed() };
    while unsafe { GetMessageW(&mut message, 0 as HWND, 0, 0) } > 0 {
        unsafe {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }

    let _ = instance_mutex;
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        show_error(&error);
    }
}
