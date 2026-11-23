import Foundation

/// One talk key, two jobs. Dictation is the default; an agent waiting on you, or the agent modifier, sends the hold to the agents instead.
enum TalkMode { case dictate, agent }

enum TalkRouter {
    static func mode(alertPending: Bool, agentModifier: Bool) -> TalkMode {
        alertPending || agentModifier ? .agent : .dictate
    }
}
