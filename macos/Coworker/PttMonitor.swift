import AppKit

/// Feeds global + local key events through PttMachine and reports PttEvents.
/// Global monitors only deliver once the app has Input Monitoring / Accessibility access.
@MainActor
final class PttMonitor {
    var onEvent: ((PttEvent) -> Void)?
    private var machine = PttMachine()
    private var monitors: [Any] = []

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
            let others = e.modifierFlags.intersection([.command, .control, .option, .shift])
            event = machine.flagsChanged(fn: e.modifierFlags.contains(.function), otherModifiers: !others.isEmpty, at: e.timestamp)
        case .keyDown:
            event = machine.keyDown()
        default:
            event = nil
        }
        if let event { onEvent?(event) }
    }

    /// Debug: drives the same machine as a real fn press.
    func simulateHold(seconds: TimeInterval) {
        send(fn: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in self?.send(fn: false) }
    }

    private func send(fn: Bool) {
        if let e = machine.flagsChanged(fn: fn, otherModifiers: false, at: ProcessInfo.processInfo.systemUptime) { onEvent?(e) }
    }
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

    private static func open(_ pane: String) {
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
        a.messageText = "Coworker needs keyboard access to hear the fn key"
        a.informativeText = "Turn Coworker on in Input Monitoring and in Accessibility (System Settings > Privacy & Security), then quit and reopen Coworker once."
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
