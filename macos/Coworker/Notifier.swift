import AppKit
@preconcurrency import UserNotifications

/// Native notifications for board alerts. Works only when launched as a bundled .app with an identifier
/// (UNUserNotificationCenter aborts for a raw binary), so anything else logs once and stays silent.
@MainActor
final class Notifier: NSObject, UNUserNotificationCenterDelegate {
    var onOpen: (() -> Void)?
    /// A button or typed reply on a notification: the alert's id and the answer.
    var onAnswer: ((String, String) -> Void)?
    private let center: UNUserNotificationCenter?

    override init() {
        let bundled = Bundle.main.bundleURL.pathExtension == "app" && Bundle.main.bundleIdentifier != nil
        center = bundled ? UNUserNotificationCenter.current() : nil
        super.init()
        if !bundled { NSLog("Coworker: notifications off; launch Terminal 1.app (open \"build/Terminal 1.app\"), not the raw binary") }
        center?.delegate = self
        center?.setNotificationCategories(Set(AlertKind.allCases.map(Self.category)))
    }

    /// Asks once; macOS remembers the answer. The prompt appears the first time this runs.
    func requestAuthorization() {
        center?.requestAuthorization(options: [.alert, .sound]) { granted, error in
            if let error { NSLog("Coworker: notification authorization failed: \(error.localizedDescription)") }
            else if !granted { NSLog("Coworker: notifications denied; enable Terminal 1 in System Settings > Notifications") }
            else { NSLog("Coworker: notifications authorized") }
        }
    }

    /// `kind` picks the buttons (Allow and Deny, Reply, Stop). Without one the notification just opens the panel.
    func post(_ alert: BoardAlert, kind: AlertKind? = nil, sound: Bool = true) {
        let title = kind == .done ? "\(alert.agent) is done" : "\(alert.agent) needs you"
        // Same identifier replaces the banner instead of stacking a duplicate.
        add(id: alert.dedupKey, title: title, body: alert.text, kind: kind, answerID: alert.id, sound: sound)
    }

    /// A plain notice, for things that went wrong while the panel was out of sight.
    func notice(_ title: String, _ body: String) {
        add(id: UUID().uuidString, title: title, body: body, kind: nil, answerID: nil, sound: false)
    }

    private func add(id: String, title: String, body: String, kind: AlertKind?, answerID: String?, sound: Bool) {
        guard let center else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = sound ? .default : nil
        if let kind, answerID != nil { content.categoryIdentifier = kind.rawValue }
        if let answerID { content.userInfo = ["id": answerID] }
        center.add(UNNotificationRequest(identifier: id, content: content, trigger: nil)) { error in
            if let error { NSLog("Coworker: could not post notification: \(error.localizedDescription)") }
            else { NSLog("Coworker: posted notification \"\(title)\"") }
        }
    }

    private static func category(_ kind: AlertKind) -> UNNotificationCategory {
        let actions = AlertActions.buttons(kind).map { button -> UNNotificationAction in
            button == AlertActions.reply
                ? UNTextInputNotificationAction(identifier: button.id, title: button.title, options: [], textInputButtonTitle: "Send", textInputPlaceholder: "Your answer")
                : UNNotificationAction(identifier: button.id, title: button.title, options: [])
        }
        return UNNotificationCategory(identifier: kind.rawValue, actions: actions, intentIdentifiers: [], options: [])
    }

    // The app is an accessory app and counts as foreground, where macOS would otherwise swallow the banner.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
        done([.banner, .sound])
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler done: @escaping () -> Void) {
        let id = response.notification.request.content.userInfo["id"] as? String
        let answer = (response as? UNTextInputNotificationResponse)?.userText ?? AlertActions.verdict(actionID: response.actionIdentifier)
        DispatchQueue.main.async {
            MainActor.assumeIsolated {
                if let id, let answer, !answer.isEmpty {
                    self.onAnswer?(id, answer)
                } else {
                    NSApp.activate(ignoringOtherApps: true)
                    self.onOpen?()
                }
            }
            done()
        }
    }
}
