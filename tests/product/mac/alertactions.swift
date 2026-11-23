// Spec: an agent alert's notification has buttons, so you can answer without opening anything.
// Needs macos/Coworker/AlertActions.swift: enum AlertKind: String { approval, question, blocked, stuck, done },
// struct AlertButton { id, title }, enum AlertActions { buttons(_:) -> [AlertButton]; verdict(actionID:) -> String? }.
import Foundation

@main struct Spec {
    static func main() {
        var fails = 0
        func check(_ ok: Bool, _ m: String) { print(ok ? "ok   \(m)" : "FAIL \(m)"); if !ok { fails += 1 } }
        check(AlertActions.buttons(.approval).map { $0.id } == ["allow", "deny"], "approval: Allow and Deny")
        check(AlertActions.buttons(.stuck).map { $0.id }.contains("stop"), "stuck: Stop")
        check(AlertActions.buttons(.question).map { $0.id } == ["reply"], "question: Reply (typed)")
        check(AlertActions.buttons(.done).isEmpty, "done: no buttons")
        check(AlertActions.buttons(.approval).allSatisfy { !$0.title.isEmpty }, "buttons have titles")
        check(AlertActions.verdict(actionID: "allow") == "allow" && AlertActions.verdict(actionID: "deny") == "deny" && AlertActions.verdict(actionID: "stop") == "stop", "verdicts")
        check(AlertActions.verdict(actionID: "reply") == nil && AlertActions.verdict(actionID: "x") == nil, "no verdict for others")
        check(AlertKind(rawValue: "question") == .question, "kinds parse from the relay")
        exit(fails == 0 ? 0 : 1)
    }
}
