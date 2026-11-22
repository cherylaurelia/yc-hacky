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

        // Idle capsule, hover, and the expanded states.
        check("idle is the tiny capsule", pill().mode, .compact)
        check("hover expands to the hint with the key", [pill(.hover(true)).mode == .hint, pill(.hover(true)).label == "Hold Right Option"], [true, true])
        check("the hint follows the configured key", pill(.hover(true), key: "fn").label, "Hold fn")
        check("leaving collapses the hint", pill(.hover(true), .hover(false)).mode, .compact)
        check("holding the key grows to the active pill", pill(.talkDown).mode, .active)
        check("hover does not shrink a held pill", pill(.talkDown, .hover(true)).mode, .active)
        check("release with the mouse still over returns to the hint", pill(.hover(true), .talkDown, .talkUp(cancelled: false)).mode, .hint)
        check("release with the mouse away returns to the capsule", pill(.talkDown, .talkUp(cancelled: false)).mode, .compact)
        check("thinking is the active pill", pill(page(.thinking)).mode, .active)
        check("speaking is the active pill", pill(page(.speaking)).mode, .active)
        check("the page going idle shrinks it back", pill(page(.speaking), page(.idle)).mode, .compact)
        check("opening the panel clears the hover", pill(.hover(true), .panelOpen(true), .panelOpen(false)).mode, .compact)
        check("hover is ignored while the panel is open", pill(.panelOpen(true), .hover(true)).mode, .hidden)

        // Alert collapse: the pill shrinks back after a while but the alert stays known, so it is not re-announced.
        var c = pill(page(.speaking, .set(ci)), page(.idle))
        c.apply(.alertCollapsed)
        check("a collapsed alert shrinks the pill", c.mode, .compact)
        check("a collapsed alert is still pending", c.alert, ci)
        c.apply(page(nil, .set(ci)))
        check("the same alert re-posted does not re-expand or re-notify", [c.mode == .compact, c.notify == nil], [true, true])
        c.apply(page(nil, .set(BoardAlert(agent: "deployer", text: "needs approval"))))
        check("a new alert expands again", [c.mode == .alert, c.notify != nil], [true, true])
        c.apply(.alertCollapsed)
        c.apply(.talkDown)
        check("holding after a collapse shows Listening", [c.mode == .active, c.label == "Listening"], [true, true])
        c.apply(.talkUp(cancelled: false))
        check("answering clears the collapsed alert", c.alert, nil)
        check("a collapsed alert hovered shows the hint", pill(page(.speaking, .set(ci)), page(.idle), .alertCollapsed, .hover(true)).mode, .hint)
        check("hover does not shrink a showing alert", pill(page(.speaking, .set(ci)), .hover(true)).mode, .alert)

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
        check("explicit clear from the page", pill(page(nil, .set(ci)), page(nil, .clear)).mode, .compact)
        check("expiry clears a stale alert", pill(page(nil, .set(ci)), .alertExpired).mode, .compact)
        check("a newer alert replaces the old one",
              pill(page(.speaking, .set(ci)), page(.speaking, .set(BoardAlert(agent: "deployer", text: "needs approval")))).label, "deployer: needs approval")
        let long = pill(page(.speaking, .set(BoardAlert(agent: "a", text: String(repeating: "x", count: 300)))))
        check("long alert text is cut", long.alert?.text.count, PillState.maxAlertText)
        check("cut text ends with an ellipsis", long.alert?.text.hasSuffix("…"), true)

        // Native notifications: one per new alert.
        let other = BoardAlert(agent: "deployer", text: "needs approval")
        var n = pill(page(.speaking, .set(ci)))
        check("a new alert asks for a notification", n.notify, ci)
        n.apply(page(.speaking, .set(ci)))
        check("the same alert re-posted does not", n.notify, nil)
        n.apply(page(.thinking))
        check("a state-only message does not", n.notify, nil)
        n.apply(page(.speaking, .set(other)))
        check("a different alert does", n.notify, other)
        n.apply(page(.speaking, .set(ci)))
        check("an alert already announced stays quiet even after another came in between", n.notify, nil)
        n.apply(page(nil, .clear))
        n.apply(page(.speaking, .set(ci)))
        check("the same alert after a clear is new again", n.notify, ci)
        n.apply(.alertExpired)
        n.apply(page(nil, .set(ci)))
        check("the same alert after expiry is new again", n.notify, ci)
        n.apply(.talkDown)
        n.apply(.talkUp(cancelled: false))
        n.apply(page(nil, .set(ci)))
        check("the same alert after the operator answered is new again", n.notify, ci)
        let withId = BoardAlert(agent: "reviewer", text: "CI is red on main", id: "req-7")
        n.apply(page(nil, .set(withId)))
        check("a request id makes it a different alert from the same text", n.notify, withId)
        n.apply(page(nil, .set(BoardAlert(agent: "reviewer", text: "CI is still red", id: "req-7"))))
        check("the same request id with reworded text is the same alert", n.notify, nil)
        check("an open panel suppresses the notification", pill(.panelOpen(true), page(.speaking, .set(ci))).notify, nil)
        var shown = pill(.panelOpen(true), page(nil, .set(ci)))
        shown.apply(.panelOpen(false))
        shown.apply(page(nil, .set(ci)))
        check("an alert seen in the open panel is not announced again when it closes", shown.notify, nil)
        let long2 = pill(page(.speaking, .set(BoardAlert(agent: "a", text: String(repeating: "x", count: 300)))))
        check("the notification keeps the full text", long2.notify?.text.count, 300)
        check("parse reads a string request id", PageMessage.parse(["alert": ["agent": "a", "text": "b", "id": "r1"]]),
              PageMessage(phase: nil, alert: .set(BoardAlert(agent: "a", text: "b", id: "r1"))))
        check("parse reads a numeric request id", PageMessage.parse(["alert": ["agent": "a", "text": "b", "id": 42]]),
              PageMessage(phase: nil, alert: .set(BoardAlert(agent: "a", text: "b", id: "42"))))
        check("parse drops an empty request id", PageMessage.parse(["alert": ["agent": "a", "text": "b", "id": ""]]),
              PageMessage(phase: nil, alert: .set(BoardAlert(agent: "a", text: "b"))))

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
