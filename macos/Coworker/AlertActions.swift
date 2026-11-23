import Foundation

/// What the agent is telling you. The raw values are what the relay and the CLI send as `kind`.
enum AlertKind: String, CaseIterable { case approval, question, blocked, stuck, done }

struct AlertButton: Equatable {
    var id: String
    var title: String
}

/// The buttons on an agent alert's notification, so you can answer without opening anything.
enum AlertActions {
    static let reply = AlertButton(id: "reply", title: "Reply")
    private static let allow = AlertButton(id: "allow", title: "Allow")
    private static let deny = AlertButton(id: "deny", title: "Deny")
    private static let stop = AlertButton(id: "stop", title: "Stop")

    static func buttons(_ kind: AlertKind) -> [AlertButton] {
        switch kind {
        case .approval: [allow, deny]
        case .question, .blocked: [reply]
        case .stuck: [stop]
        case .done: []
        }
    }

    /// The answer an agent reads for a button press. Reply has none: its answer is what you type.
    static func verdict(actionID: String) -> String? {
        [allow, deny, stop].contains { $0.id == actionID } ? actionID : nil
    }
}
