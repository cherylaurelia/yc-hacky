import AppKit
import AVFoundation

enum Phase: String {
    case idle, listening, speaking

    var symbol: String {
        switch self {
        case .idle: "waveform"
        case .listening: "waveform.circle.fill"
        case .speaking: "speaker.wave.2.fill"
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    static let defaultURL = "http://localhost:3000/?repo=cherylaurelia/yc-hacky&embed=1"
    private static let urlKey = "coworkerURL"  // also settable at launch: -coworkerURL <url>

    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let ptt = PttMonitor()
    private var panel: CoworkerPanel!
    private var activity: NSObjectProtocol?
    private var phase = Phase.idle { didSet { render() } }

    private func item(_ title: String, _ action: Selector, _ key: String = "") -> NSMenuItem {
        let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
        i.target = self
        return i
    }
    private lazy var toggleItem = item("", #selector(togglePanel))
    private lazy var accessItem = item("Grant keyboard access (fn key)...", #selector(grantAccess))
    private lazy var simulateItem = item("Simulate fn hold (1s)", #selector(simulate))

    private var configuredURL: URL {
        UserDefaults.standard.string(forKey: Self.urlKey).flatMap(URL.init(string:)) ?? URL(string: Self.defaultURL)!
    }

    func applicationDidFinishLaunching(_ note: Notification) {
        // A hidden panel must keep speaking: no App Nap.
        activity = ProcessInfo.processInfo.beginActivity(options: .userInitiatedAllowingIdleSystemSleep, reason: "Voice coworker session")

        panel = CoworkerPanel(url: configuredURL)
        panel.onPageState = { [weak self] in self?.phase = $0 }

        let menu = NSMenu()
        menu.delegate = self
        menu.items = [toggleItem, accessItem, item("Reload", #selector(reload), "r"), item("Set URL...", #selector(setURL)),
                      simulateItem, .separator(), NSMenuItem(title: "Quit Coworker", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")]
        statusItem.menu = menu
        render()

        ptt.onEvent = { [weak self] event in
            guard let self else { return }
            switch event {
            case .down: phase = .listening
            case .up: if phase == .listening { phase = .idle }
            }
            panel.deliver(event)
        }
        ptt.start()
        NSLog("Coworker: keyboard access granted=\(KeyboardAccess.granted)")
        KeyboardAccess.promptOnce()
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            if !granted { NSLog("Coworker: microphone access denied; enable it in System Settings > Privacy & Security > Microphone") }
        }

        let after = UserDefaults.standard.double(forKey: "simulateAfter")  // launch arg for scripted checks
        if after > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + after) { [weak self] in self?.simulate() } }
    }

    func menuWillOpen(_ menu: NSMenu) {
        toggleItem.title = panel.isVisible ? "Hide Panel" : "Show Panel"
        accessItem.isHidden = KeyboardAccess.granted
        simulateItem.isHidden = !(NSEvent.modifierFlags.contains(.option) || UserDefaults.standard.bool(forKey: "debug"))
    }

    private func render() {
        guard let button = statusItem.button else { return }
        button.image = NSImage(systemSymbolName: phase.symbol, accessibilityDescription: "Coworker \(phase.rawValue)")
        button.contentTintColor = phase == .listening ? .systemRed : nil
    }

    @objc private func togglePanel() { panel.setVisible(!panel.isVisible) }
    @objc private func reload() { panel.load() }
    @objc private func simulate() { ptt.simulateHold(seconds: 1) }

    @objc private func grantAccess() {
        KeyboardAccess.openInputMonitoring()
        KeyboardAccess.openAccessibility()
    }

    @objc private func setURL() {
        NSApp.activate(ignoringOtherApps: true)
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 360, height: 24))
        field.stringValue = configuredURL.absoluteString
        let alert = NSAlert()
        alert.messageText = "Coworker URL"
        alert.accessoryView = field
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let text = field.stringValue.trimmingCharacters(in: .whitespaces)
        guard let url = URL(string: text), ["http", "https"].contains(url.scheme), url.host != nil else {
            let bad = NSAlert()
            bad.messageText = "Not a valid http(s) URL"
            bad.informativeText = text
            bad.runModal()
            return
        }
        UserDefaults.standard.set(text, forKey: Self.urlKey)
        panel.setURL(url)
    }
}
