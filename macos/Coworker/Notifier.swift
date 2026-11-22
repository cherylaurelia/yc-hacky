import AppKit
@preconcurrency import UserNotifications

/// Native notifications for board alerts. Works only when launched as a bundled .app with an identifier
/// (UNUserNotificationCenter aborts for a raw binary), so anything else logs once and stays silent.
@MainActor
final class Notifier: NSObject, UNUserNotificationCenterDelegate {
    var onOpen: (() -> Void)?
    private let center: UNUserNotificationCenter?

    override init() {
        let bundled = Bundle.main.bundleURL.pathExtension == "app" && Bundle.main.bundleIdentifier != nil
        center = bundled ? UNUserNotificationCenter.current() : nil
        super.init()
        if !bundled { NSLog("Coworker: notifications off; launch Coworker.app (open build/Coworker.app), not the raw binary") }
        center?.delegate = self
    }

    /// Asks once; macOS remembers the answer. The prompt appears the first time this runs.
    func requestAuthorization() {
        center?.requestAuthorization(options: [.alert, .sound]) { granted, error in
            if let error { NSLog("Coworker: notification authorization failed: \(error.localizedDescription)") }
            else if !granted { NSLog("Coworker: notifications denied; enable Coworker in System Settings > Notifications") }
            else { NSLog("Coworker: notifications authorized") }
        }
    }

    func post(_ alert: BoardAlert) {
        guard let center else { return }
        let content = UNMutableNotificationContent()
        content.title = "\(alert.agent) needs you"
        content.body = alert.text
        content.sound = .default
        // Same identifier replaces the banner instead of stacking a duplicate.
        center.add(UNNotificationRequest(identifier: alert.dedupKey, content: content, trigger: nil)) { error in
            if let error { NSLog("Coworker: could not post notification: \(error.localizedDescription)") }
            else { NSLog("Coworker: posted notification \"\(content.title)\"") }
        }
    }

    // The app is an accessory app and counts as foreground, where macOS would otherwise swallow the banner.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
        done([.banner, .sound])
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler done: @escaping () -> Void) {
        DispatchQueue.main.async {
            MainActor.assumeIsolated {
                NSApp.activate(ignoringOtherApps: true)
                self.onOpen?()
            }
            done()
        }
    }
}
