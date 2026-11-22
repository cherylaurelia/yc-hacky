import CoreGraphics
import Foundation

// Posts real fn flagsChanged / keyDown CGEvents straight to the running Coworker process.
// Exercises the NSEvent -> PttMachine -> page path without a physical keyboard
// (macOS's global-monitor permission is bypassed because the events go to the app's own queue).
// Usage: swiftc macos/test/post-fn.swift -o /tmp/post-fn && /tmp/post-fn hold|tap|arrow|shift [fn|ropt|rcmd|rctl|lopt]
// The second argument picks the key, with the keyCode and device-side flag bits a real keyboard sends.

let keys: [String: (code: Int64, flags: UInt64)] = [
    "fn": (63, CGEventFlags.maskSecondaryFn.rawValue),
    "ropt": (61, CGEventFlags.maskAlternate.rawValue | 0x40),
    "rcmd": (54, CGEventFlags.maskCommand.rawValue | 0x10),
    "rctl": (62, CGEventFlags.maskControl.rawValue | 0x2000),
    "lopt": (58, CGEventFlags.maskAlternate.rawValue | 0x20),
]
guard let key = keys[CommandLine.arguments.dropFirst(2).first ?? "fn"] else { print("unknown key"); exit(2) }

func post(_ pid: pid_t, fn: Bool, otherFlags: CGEventFlags = []) {
    guard let e = CGEvent(source: CGEventSource(stateID: .hidSystemState)) else { fatalError("CGEvent") }
    e.type = .flagsChanged
    e.setIntegerValueField(.keyboardEventKeycode, value: key.code)
    var flags: CGEventFlags = otherFlags
    if fn { flags.insert(CGEventFlags(rawValue: key.flags)) }
    e.flags = flags
    e.postToPid(pid)
}

func arrowKey(_ pid: pid_t) {
    guard let e = CGEvent(keyboardEventSource: CGEventSource(stateID: .hidSystemState), virtualKey: 123, keyDown: true) else { fatalError("CGEvent") }
    e.flags = [.maskSecondaryFn]
    e.postToPid(pid)
}

let out = Pipe(); let p = Process()
p.executableURL = URL(fileURLWithPath: "/usr/bin/pgrep"); p.arguments = ["-x", "Coworker"]; p.standardOutput = out
try p.run(); p.waitUntilExit()
guard let pid = pid_t(String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self).split(separator: "\n").first ?? "") else {
    print("Coworker is not running"); exit(1)
}
let scenario = CommandLine.arguments.dropFirst().first ?? "hold"
switch scenario {
case "hold":  post(pid, fn: true); usleep(1_000_000); post(pid, fn: false)
case "tap":   post(pid, fn: true); usleep(80_000); post(pid, fn: false)
case "arrow": post(pid, fn: true); usleep(300_000); arrowKey(pid); usleep(300_000); post(pid, fn: false)
case "shift": post(pid, fn: true); usleep(300_000); post(pid, fn: true, otherFlags: [.maskShift]); usleep(300_000); post(pid, fn: false)
default: print("unknown scenario \(scenario)"); exit(2)
}
print("posted \(scenario) to pid \(pid)")
