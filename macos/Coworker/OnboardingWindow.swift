import AppKit
import AVFoundation

/// Draws `Onboarding.step`. Closing the window, finished or not, counts as seen: it shows once.
@MainActor
final class OnboardingWindow: NSObject, NSWindowDelegate {
    static let completedKey = "onboardingCompleted"

    private var flow = Onboarding()
    private let heading = NSTextField(labelWithString: "")
    private let detail = NSTextField(wrappingLabelWithString: "")
    private let action = NSButton(title: "", target: nil, action: nil)
    private let next = NSButton(title: "", target: nil, action: nil)
    private lazy var window = makeWindow()

    func show() {
        flow = Onboarding()
        render()
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
    }

    func windowWillClose(_ notification: Notification) {
        UserDefaults.standard.set(true, forKey: Self.completedKey)
    }

    private func render() {
        let key = TalkKeySetting.current.title
        let page: (String, String, String?)
        switch flow.step {
        case .welcome: page = ("Welcome to Coworker", "Hold your talk key and speak. Your words are typed into the app in front of you, or go to your agents when one is waiting on you.", nil)
        case .microphone: page = ("Allow the microphone", "Coworker listens only while you hold the talk key.", "Allow Microphone")
        case .accessibility: page = ("Allow Accessibility", "This lets Coworker paste what you said into the app you are using. Turn Coworker on in System Settings > Privacy & Security > Accessibility.", "Open Accessibility")
        case .inputMonitoring: page = ("Allow Input Monitoring", "This lets Coworker see the talk key while another app is in front. Turn Coworker on, then quit and reopen it once.", "Open Input Monitoring")
        case .talkKey: page = ("Your talk key is \(key)", "Hold it to dictate. When an agent is waiting on you, the same hold answers it. Change the key any time in Settings.", nil)
        case .agents: page = ("Connect your agents", "Run `coworker install claude` (or codex, cursor) in a terminal. Agents then reach you here when they need an approval or have a question.", nil)
        case .done: page = ("You're set", "Hold \(key) anywhere and talk.", nil)
        }
        heading.stringValue = page.0
        detail.stringValue = page.1
        action.title = page.2 ?? ""
        action.isHidden = page.2 == nil
        next.title = flow.step == .welcome ? "Get Started" : flow.step == .done ? "Done" : "Continue"
    }

    @objc private func act() {
        switch flow.step {
        case .microphone:
            if AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined { AVCaptureDevice.requestAccess(for: .audio) { _ in } }
            else { KeyboardAccess.open("Privacy_Microphone") }
        case .accessibility: KeyboardAccess.openAccessibility()
        case .inputMonitoring: KeyboardAccess.openInputMonitoring()
        default: break
        }
    }

    @objc private func advance() {
        if flow.step == .done { return window.close() }
        flow.next(.current)
        render()
    }

    private func makeWindow() -> NSWindow {
        heading.font = .boldSystemFont(ofSize: 20)
        detail.preferredMaxLayoutWidth = 372
        for (button, selector) in [(action, #selector(act)), (next, #selector(advance))] {
            button.target = self
            button.action = selector
            button.bezelStyle = .rounded
        }
        next.keyEquivalent = "\r"
        let stack = NSStackView(views: [heading, detail, action])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 12

        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 420, height: 240), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        w.title = "Coworker"
        w.isReleasedWhenClosed = false
        w.delegate = self
        let content = w.contentView!
        for v in [stack, next] as [NSView] {
            v.translatesAutoresizingMaskIntoConstraints = false
            content.addSubview(v)
        }
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: content.topAnchor, constant: 28), stack.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -24),
            next.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -24), next.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -20),
        ])
        w.center()
        return w
    }
}
