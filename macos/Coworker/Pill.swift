import Foundation

/// The one state the menu-bar icon and the pill follow. Raw values are what the page posts.
enum Phase: String {
    case idle, listening, thinking, speaking

    var symbol: String {
        switch self {
        case .idle: "waveform"
        case .listening: "waveform.circle.fill"
        case .thinking: "ellipsis.circle"
        case .speaking: "speaker.wave.2.fill"
        }
    }
}

struct BoardAlert: Equatable {
    var agent: String
    var text: String
    var id: String? = nil  // the page's request id, when it sends one

    /// Same key = same alert. The page re-posts the current alert with every state message.
    var dedupKey: String { id.map { "id:\($0)" } ?? "\(agent)\u{1F}\(text)" }
}

/// Page -> app: window.webkit.messageHandlers.coworker.postMessage({state, alert}).
/// Both keys are optional. `alert: null` (or an empty alert) clears the pill's alert line.
struct PageMessage: Equatable {
    enum AlertChange: Equatable { case unchanged, set(BoardAlert), clear }
    var phase: Phase?
    var alert = AlertChange.unchanged

    static func parse(_ body: Any) -> PageMessage? {
        guard let dict = body as? [String: Any] else { return nil }
        var msg = PageMessage()
        msg.phase = (dict["state"] as? String).flatMap(Phase.init(rawValue:))
        if let raw = dict["alert"] {
            let a = raw as? [String: Any]
            let id = (a?["id"] as? String) ?? (a?["id"] as? NSNumber)?.stringValue
            let text = (a?["text"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let agent = (a?["agent"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            msg.alert = text.isEmpty ? .clear : .set(BoardAlert(agent: agent.isEmpty ? "Alert" : agent, text: text, id: id?.isEmpty == false ? id : nil))
        }
        return msg.phase == nil && msg.alert == .unchanged ? nil : msg
    }
}

/// What the floating pill shows. Pure: AppDelegate feeds it inputs and draws `mode`, `label` and `meterLive`.
struct PillState: Equatable {
    enum Input: Equatable {
        case talkDown
        case talkUp(cancelled: Bool)
        case page(PageMessage)
        case panelOpen(Bool)
        case alertExpired
        case alertCollapsed
        case hover(Bool)
    }
    /// hidden: the full panel is open. compact: the idle 44x8 capsule. hint: hovered, shows the talk key.
    /// active: the 180x44 pill while the key is held or the page is listening, thinking or speaking. alert: "<agent>: <text>".
    enum Mode: Equatable { case hidden, compact, hint, active, alert }

    static let maxAlertText = 90

    var phase = Phase.idle
    var held = false
    var alert: BoardAlert?
    var panelOpen = false
    var hovered = false
    /// The alert is on screen. It drops back to false after a few seconds while `alert` stays, so a re-post of the same alert neither re-expands nor re-notifies.
    var alertShown = false
    var talkKey = "fn"
    /// Set by `apply` when an alert arrives that was not announced yet; the caller posts the native notification.
    /// Nil after every other input, and while the full panel is open (the alert is already in front of the operator).
    var notify: BoardAlert?
    private var announced = Set<String>()

    var mode: Mode {
        if panelOpen { return .hidden }
        if alert != nil && alertShown { return .alert }
        if held || phase != .idle { return .active }
        return hovered ? .hint : .compact
    }
    /// The level meter runs only while the mic is really live for this hold.
    var meterLive: Bool { held && phase == .listening }

    var label: String {
        if let alert, alertShown { return "\(alert.agent): \(alert.text)" }
        if held && phase == .thinking { return "Connecting" }
        switch phase {
        case .idle: return "Hold \(talkKey)"
        case .listening: return "Listening"
        case .thinking: return "Thinking"
        case .speaking: return "Speaking"
        }
    }

    mutating func apply(_ input: Input) {
        notify = nil
        switch input {
        case .talkDown:
            held = true
            phase = .listening
        case .talkUp(let cancelled):
            held = false
            if phase == .listening { phase = .idle }
            if !cancelled { clearAlert() }  // a real hold is the answer
        case .page(let m):
            if let p = m.phase { phase = p }
            switch m.alert {
            case .unchanged: break
            case .clear: clearAlert()
            case .set(var a):
                if announced.insert(a.dedupKey).inserted {
                    alertShown = true
                    if !panelOpen { notify = a }
                }
                if a.text.count > Self.maxAlertText { a.text = String(a.text.prefix(Self.maxAlertText - 1)) + "…" }
                alert = a
            }
        case .panelOpen(let open):
            panelOpen = open
            if open { hovered = false }
        case .alertExpired:
            clearAlert()
        case .alertCollapsed:
            alertShown = false
        case .hover(let inside):
            hovered = inside
        }
    }

    private mutating func clearAlert() {
        alert = nil
        alertShown = false
        announced = []
    }
}

enum Meter {
    /// RMS (0...1) to a 0...1 bar height on a -50 dB to 0 dB scale, so quiet speech still moves the bars.
    static func level(rms: Float) -> Float {
        guard rms > 0 else { return 0 }
        return min(1, max(0, (20 * log10(rms) + 50) / 50))
    }
}
