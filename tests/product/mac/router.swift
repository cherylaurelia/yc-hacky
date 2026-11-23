// Spec: one talk key, two jobs. Hold = dictate into the focused app; while an agent waits on you,
// or with the agent modifier held, the same hold talks to your agents instead.
// Needs macos/Coworker/Talk.swift: enum TalkMode { dictate, agent } and TalkRouter.mode(alertPending:agentModifier:).
import Foundation

@main struct Spec {
    static func main() {
        var fails = 0
        func check(_ ok: Bool, _ m: String) { print(ok ? "ok   \(m)" : "FAIL \(m)"); if !ok { fails += 1 } }
        check(TalkRouter.mode(alertPending: false, agentModifier: false) == .dictate, "plain hold dictates")
        check(TalkRouter.mode(alertPending: true, agentModifier: false) == .agent, "a waiting agent gets the next hold")
        check(TalkRouter.mode(alertPending: false, agentModifier: true) == .agent, "the agent modifier talks to agents")
        check(TalkRouter.mode(alertPending: true, agentModifier: true) == .agent, "both: agent")
        exit(fails == 0 ? 0 : 1)
    }
}
