import Foundation

// Logic for the floating pill and the page -> app message. Build and run with macos/test.sh
@main
struct PillLogicTest {
    static var failed = 0

    static func check<T: Equatable>(_ name: String, _ got: T, _ want: T) {
        if got == want { print("ok   \(name)") }
        else { failed += 1; print("FAIL \(name)\n  want \(want)\n  got  \(got)") }
    }

    static func pill(_ inputs: PillState.Input..., key: String = "Right Option") -> PillState {
        var s = PillState()
        s.talkKey = key
        for i in inputs { s.apply(i) }
        return s
    }

    static func page(_ state: Phase? = nil, _ alert: PageMessage.AlertChange = .unchanged) -> PillState.Input {
        .page(PageMessage(phase: state, alert: alert))
    }

    static let ci = BoardAlert(agent: "reviewer", text: "CI is red on main")

    static func main() {
        // The idle pill hints the talk key.
        check("idle pill is compact and hints the key", [pill().mode == .compact, pill().label == "Hold Right Option", !pill().meterLive], [true, true, true])

        // Holding the key.
        check("key down shows Listening with the meter", [pill(.talkDown).label, "\(pill(.talkDown).meterLive)"], ["Listening", "true"])
        check("key down before the page answers: icon is listening", pill(.talkDown).phase, .listening)
        check("release after a hold returns to idle", pill(.talkDown, .talkUp(cancelled: false)).phase, .idle)
        check("release of a tap returns to idle too", pill(.talkDown, .talkUp(cancelled: true)).phase, .idle)
        check("meter is off after release", pill(.talkDown, .talkUp(cancelled: false)).meterLive, false)

        // First hold starts a session: the page says thinking while it connects, then listening.
        let connecting = pill(.talkDown, page(.thinking))
        check("held while the page connects: label Connecting, no meter", [connecting.label, "\(connecting.meterLive)"], ["Connecting", "false"])
        let live = pill(.talkDown, page(.thinking), page(.listening))
        check("held and the page is live: Listening with the meter", [live.label, "\(live.meterLive)"], ["Listening", "true"])

        let noConnect = pill(.talkDown, page(.thinking), page(.idle))
        check("held but the page went idle (connect failed): no Listening claim, no meter", [noConnect.label, "\(noConnect.meterLive)"], ["Hold Right Option", "false"])

        // After release the page drives the state.
        let sent = pill(.talkDown, page(.listening), .talkUp(cancelled: false), page(.thinking))
        check("after release the page's thinking shows", [sent.phase.rawValue, sent.label], ["thinking", "Thinking"])
        check("page speaking", pill(page(.speaking)).label, "Speaking")
        check("page idle again", pill(page(.speaking), page(.idle)).phase, .idle)
        check("late release does not undo a speaking page", pill(.talkDown, .talkUp(cancelled: false), page(.speaking)).phase, .speaking)
        check("release keeps a page state that is not listening",
              pill(.talkDown, page(.speaking), .talkUp(cancelled: false)).phase, .speaking)

        // Panel open hides the pill.
        check("panel open hides the pill", pill(.panelOpen(true)).mode, .hidden)
        check("panel closed brings it back", pill(.panelOpen(true), .panelOpen(false)).mode, .compact)
        check("an alert does not bring the pill back over an open panel", pill(.panelOpen(true), page(.speaking, .set(ci))).mode, .hidden)

        // Alerts.
        let alerted = pill(page(.speaking, .set(ci)))
        check("alert expands the pill", alerted.mode, .alert)
        check("alert label is '<agent>: <text>'", alerted.label, "reviewer: CI is red on main")
        check("alert stays while the page goes idle (still unanswered)", pill(page(.speaking, .set(ci)), page(.idle)).mode, .alert)
        check("alert stays through a state-only message", pill(page(.speaking, .set(ci)), page(.thinking)).alert, ci)
        check("holding to answer keeps the text and runs the meter",
              [pill(page(.speaking, .set(ci)), .talkDown).label, "\(pill(page(.speaking, .set(ci)), .talkDown).meterLive)"], ["reviewer: CI is red on main", "true"])
        check("a real hold answers the alert", pill(page(.speaking, .set(ci)), .talkDown, .talkUp(cancelled: false)).mode, .compact)
        check("a cancelled tap does not answer it", pill(page(.speaking, .set(ci)), .talkDown, .talkUp(cancelled: true)).mode, .alert)
        check("explicit clear from the page", pill(page(.speaking, .set(ci)), page(nil, .clear)).mode, .compact)
        check("expiry clears a stale alert", pill(page(.speaking, .set(ci)), .alertExpired).mode, .compact)
        check("a newer alert replaces the old one",
              pill(page(.speaking, .set(ci)), page(.speaking, .set(BoardAlert(agent: "deployer", text: "needs approval")))).label, "deployer: needs approval")
        let long = pill(page(.speaking, .set(BoardAlert(agent: "a", text: String(repeating: "x", count: 300)))))
        check("long alert text is cut", long.alert?.text.count, PillState.maxAlertText)
        check("cut text ends with an ellipsis", long.alert?.text.hasSuffix("…"), true)

        // Page messages, parsed defensively.
        check("parse state only", PageMessage.parse(["state": "thinking"]), PageMessage(phase: .thinking, alert: .unchanged))
        check("parse state and alert",
              PageMessage.parse(["state": "speaking", "alert": ["agent": " reviewer ", "text": " CI is red on main "]]), PageMessage(phase: .speaking, alert: .set(ci)))
        check("parse alert without a state", PageMessage.parse(["alert": ["agent": "a", "text": "b"]]), PageMessage(phase: nil, alert: .set(BoardAlert(agent: "a", text: "b"))))
        check("parse alert without an agent", PageMessage.parse(["alert": ["text": "b"]]), PageMessage(phase: nil, alert: .set(BoardAlert(agent: "Alert", text: "b"))))
        check("parse alert null clears", PageMessage.parse(["state": "idle", "alert": NSNull()]), PageMessage(phase: .idle, alert: .clear))
        check("parse alert with empty text clears", PageMessage.parse(["state": "idle", "alert": ["agent": "a", "text": "  "]]), PageMessage(phase: .idle, alert: .clear))
        check("parse alert of the wrong type clears", PageMessage.parse(["state": "idle", "alert": "oops"]), PageMessage(phase: .idle, alert: .clear))
        check("parse unknown state keeps the alert", PageMessage.parse(["state": "dancing", "alert": ["agent": "a", "text": "b"]]),
              PageMessage(phase: nil, alert: .set(BoardAlert(agent: "a", text: "b"))))
        check("parse unknown state alone is dropped", PageMessage.parse(["state": "dancing"]), nil)
        check("parse a non-dictionary is dropped", PageMessage.parse("speaking"), nil)
        check("parse a non-string text is dropped", PageMessage.parse(["alert": ["agent": "a", "text": 5]]), PageMessage(phase: nil, alert: .clear))
        check("every phase the page can send parses", ["idle", "listening", "thinking", "speaking"].compactMap { PageMessage.parse(["state": $0])?.phase },
              [.idle, .listening, .thinking, .speaking])

        // Level meter.
        check("silence is zero", Meter.level(rms: 0), 0)
        check("full scale is one", Meter.level(rms: 1), 1)
        check("clipping stays at one", Meter.level(rms: 4), 1)
        check("far below -50 dB is zero", Meter.level(rms: 0.0001), 0)
        check("quiet speech (-30 dB) moves the bars", Meter.level(rms: 0.0316) > 0.35, true)
        check("louder is higher", Meter.level(rms: 0.1) > Meter.level(rms: 0.02), true)

        if failed > 0 { print("\(failed) failed"); exit(1) }
        print("all passed")
    }
}
