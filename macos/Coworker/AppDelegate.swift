import AppKit
import AVFoundation

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    static let defaultURL = "http://localhost:3000/?repo=cherylaurelia/yc-hacky&embed=1"
    private static let urlKey = "coworkerURL"  // also settable at launch: -coworkerURL <url>

    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let ptt = PttMonitor()
    private let pillWindow = PillWindow()
    private let mic = MicLevel()
    private let notifier = Notifier()
    private var simulatedAlerts = 0
    private var panel: CoworkerPanel!
    private var activity: NSObjectProtocol?
    private var alertExpiry: DispatchWorkItem?
    private var pill = PillState() { didSet { render() } }

    private func item(_ title: String, _ action: Selector, _ key: String = "") -> NSMenuItem {
        let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
        i.target = self
        return i
    }
    private lazy var toggleItem = item("", #selector(togglePanel))
    private lazy var accessItem = item("Grant keyboard access...", #selector(grantAccess))
    private lazy var simulateItem = item("Simulate talk key hold (1s)", #selector(simulate))
    private lazy var simulateAlertItem = item("Simulate alert", #selector(simulateAlert))
    private lazy var noteItem: NSMenuItem = {
        let i = NSMenuItem(title: TalkKeySetting.note, action: nil, keyEquivalent: "")
        i.isEnabled = false
        return i
    }()
    private lazy var talkKeyItem: NSMenuItem = {
        let i = NSMenuItem(title: "", action: nil, keyEquivalent: "")
        i.submenu = NSMenu()
        for key in TalkKey.allCases {
            let k = item(key.title, #selector(pickTalkKey(_:)))
            k.representedObject = key.rawValue
            i.submenu?.addItem(k)
        }
        return i
    }()

    private var configuredURL: URL {
        UserDefaults.standard.string(forKey: Self.urlKey).flatMap(URL.init(string:)) ?? URL(string: Self.defaultURL)!
    }

    func applicationDidFinishLaunching(_ note: Notification) {
        // A hidden panel must keep speaking: no App Nap.
        activity = ProcessInfo.processInfo.beginActivity(options: .userInitiatedAllowingIdleSystemSleep, reason: "Voice coworker session")

        panel = CoworkerPanel(url: configuredURL)
        panel.onPageMessage = { [weak self] in self?.apply(.page($0)) }
        panel.onVisibilityChange = { [weak self] in self?.apply(.panelOpen($0)) }
        pillWindow.onClick = { [weak self] in self?.panel.setVisible(true) }
        notifier.onOpen = { [weak self] in self?.panel.setVisible(true) }
        notifier.requestAuthorization()
        mic.onLevel = { [weak self] in self?.pillWindow.setLevel($0) }
        pill.panelOpen = panel.isVisible
        pill.talkKey = ptt.key.title

        let menu = NSMenu()
        menu.delegate = self
        menu.items = [noteItem, toggleItem, accessItem, talkKeyItem, item("Reload", #selector(reload), "r"), item("Set URL...", #selector(setURL)),
                      simulateItem, simulateAlertItem, .separator(), NSMenuItem(title: "Quit Terminal 1", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")]
        statusItem.menu = menu
        render()
        renderTalkKey()

        ptt.onEvent = { [weak self] event in
            guard let self else { return }
            switch event {
            case .down:
                apply(.talkDown)
                mic.start()
            case .up(let cancelled):
                mic.stop()
                apply(.talkUp(cancelled: cancelled))
            }
            panel.deliver(event)
        }
        ptt.start()
        NSLog("Coworker: keyboard access granted=\(KeyboardAccess.granted)")
        KeyboardAccess.promptOnce()
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            if !granted { NSLog("Coworker: microphone access denied; enable it in System Settings > Privacy & Security > Microphone") }
        }

        let after = UserDefaults.standard.double(forKey: "simulateAfter")  // launch args for scripted checks: -simulateAfter 5 -simulateSeconds 3
        if after > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + after) { [weak self] in self?.simulate() } }
        let alertAfter = UserDefaults.standard.double(forKey: "simulateAlertAfter")  // -simulateAlertAfter 5
        if alertAfter > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + alertAfter) { [weak self] in self?.simulateAlert() } }
    }

    func menuWillOpen(_ menu: NSMenu) {
        toggleItem.title = panel.isVisible ? "Hide Panel" : "Show Panel"
        accessItem.isHidden = KeyboardAccess.granted
        noteItem.isHidden = !TalkKeySetting.notePending
        let debug = NSEvent.modifierFlags.contains(.option) || UserDefaults.standard.bool(forKey: "debug")
        simulateItem.isHidden = !debug
        simulateAlertItem.isHidden = !debug
    }

    func menuDidClose(_ menu: NSMenu) {
        if TalkKeySetting.notePending { TalkKeySetting.noteShown() }
    }

    private func renderTalkKey() {
        pill.talkKey = ptt.key.title
        talkKeyItem.title = "Talk key: \(ptt.key.title)"
        for i in talkKeyItem.submenu?.items ?? [] { i.state = i.representedObject as? String == ptt.key.rawValue ? .on : .off }
        panel.sendTalkKey(ptt.key.title)
    }

    @objc private func pickTalkKey(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let key = TalkKey(rawValue: raw) else { return }
        TalkKeySetting.set(key)
        ptt.setKey(key)
        renderTalkKey()
    }

    private func apply(_ input: PillState.Input) {
        let hadAlert = pill.alert
        pill.apply(input)
        if let alert = pill.notify { notifier.post(alert) }
        guard pill.alert != hadAlert else { return }
        alertExpiry?.cancel()
        guard pill.alert != nil else { return }
        let work = DispatchWorkItem { [weak self] in self?.apply(.alertExpired) }  // never leave a stale alert on screen
        alertExpiry = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 120, execute: work)
    }

    private func render() {
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: pill.phase.symbol, accessibilityDescription: "Terminal 1 \(pill.phase.rawValue)")
            button.contentTintColor = pill.phase == .listening ? .systemRed : nil
        }
        pillWindow.render(pill)
        Probe.log("icon=\(pill.phase.symbol) pill=\(pill.mode) \"\(pill.label)\" meter=\(pill.meterLive)")
    }

    @objc private func togglePanel() { panel.setVisible(!panel.isVisible) }
    @objc private func reload() { panel.load() }
    @objc private func simulate() {
        let seconds = UserDefaults.standard.double(forKey: "simulateSeconds")
        ptt.simulateHold(seconds: seconds > 0 ? seconds : 1)
    }

    /// Same path as a real page message, with a fresh id each time so de-dup lets every click through.
    @objc private func simulateAlert() {
        simulatedAlerts += 1
        let alert = BoardAlert(agent: "Eithan's Claude", text: "Needs your call on the migration plan (#\(simulatedAlerts))", id: "sim-\(simulatedAlerts)")
        apply(.page(PageMessage(phase: nil, alert: .set(alert))))
    }

    @objc private func grantAccess() {
        KeyboardAccess.openInputMonitoring()
        KeyboardAccess.openAccessibility()
    }

    @objc private func setURL() {
        NSApp.activate(ignoringOtherApps: true)
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 360, height: 24))
        field.stringValue = configuredURL.absoluteString
        let alert = NSAlert()
        alert.messageText = "Terminal 1 URL"
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
