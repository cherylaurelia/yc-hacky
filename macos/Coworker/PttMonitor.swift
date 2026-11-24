import AppKit

/// Feeds global + local key events through PttMachine and reports PttEvents.
/// Global monitors only deliver once the app has Input Monitoring / Accessibility access.
@MainActor
final class PttMonitor {
    var onEvent: ((PttEvent) -> Void)?
    private var machine = PttMachine()
    private var monitors: [Any] = []
    private(set) var key = TalkKeySetting.current

    func setKey(_ new: TalkKey) {
        key = new
        machine = PttMachine()
    }

    func start() {
        let mask: NSEvent.EventTypeMask = [.flagsChanged, .keyDown]
        if let m = NSEvent.addGlobalMonitorForEvents(matching: mask, handler: { [weak self] e in
            MainActor.assumeIsolated { self?.handle(e) }
        }) { monitors.append(m) } else { NSLog("Coworker: global key monitor was not installed") }
        if let m = NSEvent.addLocalMonitorForEvents(matching: mask, handler: { [weak self] e in
            MainActor.assumeIsolated { self?.handle(e) }
            return e
        }) { monitors.append(m) } else { NSLog("Coworker: local key monitor was not installed") }
    }

    private func handle(_ e: NSEvent) {
        let event: PttEvent?
        switch e.type {
        case .flagsChanged:
            let s = key.sample(rawFlags: e.modifierFlags.rawValue)
            event = machine.flagsChanged(fn: s.down, otherModifiers: s.others, at: e.timestamp)
        case .keyDown:
            event = machine.keyDown()
        default:
            event = nil
        }
        if let event { onEvent?(event) }
    }

    /// Debug: drives the same machine as a real press of the talk key.
    func simulateHold(seconds: TimeInterval) {
        send(fn: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in self?.send(fn: false) }
    }

    private func send(fn: Bool) {
        if let e = machine.flagsChanged(fn: fn, otherModifiers: false, at: ProcessInfo.processInfo.systemUptime) { onEvent?(e) }
    }
}

/// The talk key choice, persisted in UserDefaults.
enum TalkKeySetting {
    private static let keyKey = "talkKey"
    private static let notePendingKey = "talkKeyWisprNotePending"
    private static let wisprBundleID = "com.electron.wispr-flow"

    static var wisprInstalled: Bool {
        if NSWorkspace.shared.urlForApplication(withBundleIdentifier: wisprBundleID) != nil { return true }
        let fm = FileManager.default
        return ["/Applications", fm.homeDirectoryForCurrentUser.appendingPathComponent("Applications").path]
            .contains { fm.fileExists(atPath: "\($0)/Wispr Flow.app") }
    }

    /// First read decides the default and saves it, so installing Wispr later never changes the key.
    static var current: TalkKey {
        let d = UserDefaults.standard
        if let raw = d.string(forKey: keyKey), let key = TalkKey(rawValue: raw) { return key }
        let wispr = wisprInstalled
        let key = TalkKey.defaultKey(wisprInstalled: wispr)
        d.set(key.rawValue, forKey: keyKey)
        if wispr { d.set(true, forKey: notePendingKey) }
        return key
    }

    static func set(_ key: TalkKey) {
        UserDefaults.standard.set(key.rawValue, forKey: keyKey)
        UserDefaults.standard.set(false, forKey: notePendingKey)
    }

    static var notePending: Bool { UserDefaults.standard.bool(forKey: notePendingKey) }
    static func noteShown() { UserDefaults.standard.set(false, forKey: notePendingKey) }
    static let note = "Wispr Flow uses fn, so Terminal 1 uses Right Option. Change in Talk key."
}

enum KeyboardAccess {
    private static let promptedKey = "keyboardAccessPrompted"

    static var granted: Bool { AXIsProcessTrusted() && CGPreflightListenEventAccess() }

    static func openInputMonitoring() {
        _ = CGRequestListenEventAccess()  // registers the app in the Input Monitoring list
        open("Privacy_ListenEvent")
    }

    static func openAccessibility() {
        _ = AXIsProcessTrustedWithOptions(["AXTrustedCheckOptionPrompt": true] as CFDictionary)  // registers the app in the Accessibility list
        open("Privacy_Accessibility")
    }

    static func open(_ pane: String) {
        let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(pane)")!
        if !NSWorkspace.shared.open(url) { NSLog("Coworker: could not open System Settings pane \(pane)") }
    }

    /// One-time explainer. The menu keeps a "Grant keyboard access" item until both are granted.
    @MainActor
    static func promptOnce() {
        guard !granted, !UserDefaults.standard.bool(forKey: promptedKey) else { return }
        UserDefaults.standard.set(true, forKey: promptedKey)
        NSApp.activate(ignoringOtherApps: true)
        let a = NSAlert()
        a.messageText = "Terminal 1 needs keyboard access to hear the \(TalkKeySetting.current.title) key"
        a.informativeText = "Turn Terminal 1 on in Input Monitoring and in Accessibility (System Settings > Privacy & Security), then quit and reopen Terminal 1 once."
        a.addButton(withTitle: "Open Input Monitoring")
        a.addButton(withTitle: "Open Accessibility")
        a.addButton(withTitle: "Later")
        switch a.runModal() {
        case .alertFirstButtonReturn: openInputMonitoring()
        case .alertSecondButtonReturn: openAccessibility()
        default: break
        }
    }
}
