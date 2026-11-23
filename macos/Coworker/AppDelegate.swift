import AppKit
import AVFoundation

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private static let urlKey = "coworkerURL"  // also settable at launch: -coworkerURL <url>

    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let ptt = PttMonitor()
    private let pillWindow = PillWindow()
    private let mic = MicLevel()
    private let notifier = Notifier()
    private let inserter = TextInserter()
    private let settingsWindow = SettingsWindow()
    private let onboardingWindow = OnboardingWindow()
    private let license = LicenseManager()
    private let relayToken = RelayServer.makeToken()
    private lazy var relay = RelayServer(token: relayToken)
    private var scribe: ScribeClient?
    private var holdMode = TalkMode.agent  // decided when the key goes down, because the hold itself clears the alert
    private var awaiting = Set<String>()       // relay approvals and questions an agent is still waiting on
    private var relayAlertIDs = Set<String>()  // pill alerts that came from the relay rather than the page
    private var simulatedAlerts = 0
    private var panel: CoworkerPanel!
    private var activity: NSObjectProtocol?
    private var alertExpiry: DispatchWorkItem?
    private var alertCollapse: DispatchWorkItem?
    private var hoverWork: DispatchWorkItem?
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
    private lazy var updateItem: NSMenuItem = {
        let i = item("", #selector(openDownload))
        i.isHidden = true  // shown once the site publishes a newer version
        return i
    }()
    private let updates = UpdateChecker()
    private lazy var versionItem: NSMenuItem = {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
        let i = NSMenuItem(title: "Version \(version)", action: nil, keyEquivalent: "")
        i.isEnabled = false
        return i
    }()
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
        UserDefaults.standard.string(forKey: Self.urlKey).flatMap(URL.init(string:)) ?? AppConfig.defaultPage
    }
    private var settings: AppSettings { .load() }

    func applicationDidFinishLaunching(_ note: Notification) {
        // A hidden panel must keep speaking: no App Nap.
        activity = ProcessInfo.processInfo.beginActivity(options: .userInitiatedAllowingIdleSystemSleep, reason: "Terminal 1 voice session")

        panel = CoworkerPanel(url: configuredURL, license: license.grant)
        license.onKeyChange = { [weak self] in self?.panel.setLicense($0) }
        settingsWindow.license = license
        Task { await license.validateOnLaunch() }
        panel.onPageMessage = { [weak self] in self?.apply(.page($0)) }
        panel.onVisibilityChange = { [weak self] in self?.apply(.panelOpen($0)) }
        pillWindow.onClick = { [weak self] in self?.panel.setVisible(true) }
        pillWindow.onHover = { [weak self] in self?.hover($0) }
        panel.onAnswer = { [weak self] in self?.answered($0, $1) }
        notifier.onOpen = { [weak self] in self?.panel.setVisible(true) }
        notifier.onAnswer = { [weak self] in self?.answered($0, $1) }
        settingsWindow.onChange = { [weak self] in
            guard let self, $0.talkKey != ptt.key else { return }
            setTalkKey($0.talkKey)
        }
        notifier.requestAuthorization()
        mic.onLevel = { [weak self] in self?.pillWindow.setLevel($0) }
        pill.panelOpen = panel.isVisible
        pill.talkKey = ptt.key.title

        let menu = NSMenu()
        menu.delegate = self
        menu.items = [noteItem, toggleItem, accessItem, talkKeyItem, item("Settings...", #selector(openSettings), ","), item("Reload", #selector(reload), "r"),
                      item("Set URL...", #selector(setURL)), simulateItem, simulateAlertItem, .separator(), versionItem,
                      NSMenuItem(title: "Quit Terminal 1", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")]
        statusItem.menu = menu
        render()
        renderTalkKey()

        ptt.onEvent = { [weak self] event in
            guard let self else { return }
            switch event {
            case .down:
                // An agent waiting on an answer, or a board alert the page is reading, gets the hold; so does the open panel.
                let pageAlert = pill.alert.map { !self.relayAlertIDs.contains($0.id ?? "") } ?? false
                holdMode = TalkRouter.mode(alertPending: !awaiting.isEmpty || pageAlert, agentModifier: panel.isVisible)
                apply(.talkDown)
                mic.start()
                if holdMode == .dictate { startDictation() }
            case .up(let cancelled):
                mic.stop()
                apply(.talkUp(cancelled: cancelled || holdMode == .dictate))  // dictating is not an answer to the alert
                if holdMode == .dictate {
                    if cancelled { scribe?.cancel() } else { scribe?.finish() }
                }
            }
            if holdMode == .agent { panel.deliver(event) }
        }
        ptt.start()
        startRelay()
        NSLog("Coworker: keyboard access granted=\(KeyboardAccess.granted)")
        if Onboarding.needed(completed: UserDefaults.standard.bool(forKey: OnboardingWindow.completedKey)) {
            onboardingWindow.show()  // asks for the same permissions, one at a time
        } else {
            KeyboardAccess.promptOnce()
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                if !granted { NSLog("Coworker: microphone access denied; enable it in System Settings > Privacy & Security > Microphone") }
            }
        }

        if let dir = UserDefaults.standard.string(forKey: "pillSnapshots") { snapshotRun(dir) }  // -pillSnapshots /tmp/dir

        let after = UserDefaults.standard.double(forKey: "simulateAfter")  // launch args for scripted checks: -simulateAfter 5 -simulateSeconds 3
        if after > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + after) { [weak self] in self?.simulate() } }
        let alertAfter = UserDefaults.standard.double(forKey: "simulateAlertAfter")  // -simulateAlertAfter 5
        if alertAfter > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + alertAfter) { [weak self] in self?.simulateAlert() } }

        menu.insertItem(updateItem, at: menu.index(of: versionItem) + 1)
        updates.onUpdate = { [weak self] version in
            self?.updateItem.title = "Update available: \(version)\u{2026}"
            self?.updateItem.isHidden = false
            NSLog("Coworker: update available: \(version)")
        }
        updates.start { [weak self] in self?.configuredURL ?? AppConfig.defaultPage }
    }

    func applicationWillTerminate(_ note: Notification) {
        relay.stop()
        do { try FileManager.default.removeItem(at: RelayServer.discoveryFile) }  // a stale port could be reused by another process
        catch { NSLog("Coworker: could not remove the relay discovery file: \(error.localizedDescription)") }
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
        setTalkKey(key)
    }

    private func setTalkKey(_ key: TalkKey) {
        TalkKeySetting.set(key)
        ptt.setKey(key)
        renderTalkKey()
    }

    private func startDictation() {
        let client = ScribeClient(language: settings.dictationLanguage) { [panel] in try await panel!.scribeToken() }
        client.onCommitted = { [weak self] in self?.inserter.insert($0) }
        client.onFailure = { [weak self] in self?.dictationFailed($0) }
        scribe = client
        client.start()
    }

    private func dictationFailed(_ why: String) {
        NSLog("Coworker: dictation failed: \(why)")
        notifier.notice("Dictation failed", why)
    }

    private func startRelay() {
        relay.onEvent = { [weak self] event in
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.relayEvent(event) } }
        }
        do {
            let port = try relay.start(port: 0)
            try RelayServer.writeDiscovery(port: port, token: relayToken, to: RelayServer.discoveryFile)
            NSLog("Coworker: relay listening on 127.0.0.1:\(port)")
        } catch {
            NSLog("Coworker: the relay did not start, so agents fall back to the board: \(error.localizedDescription)")
        }
    }

    /// An agent's event: the pill and a notification (with answer buttons) for you, and the page, which can speak it.
    private func relayEvent(_ event: RelayEvent) {
        relayAlertIDs.insert(event.id)
        if event.kind == "approval" || event.kind == "question" {
            awaiting.insert(event.id)
            // The agent stops waiting after its own timeout; never let a dead request take over the talk key.
            DispatchQueue.main.asyncAfter(deadline: .now() + 120) { [weak self] in self?.awaiting.remove(event.id) }
        }
        panel.deliverRelay(event.json)
        apply(.page(PageMessage(phase: nil, alert: .set(event.alert))), kind: AlertKind(rawValue: event.kind))
    }

    /// From a notification button or the page: the agent's long-poll gets it, and the pill stops asking.
    private func answered(_ id: String, _ text: String) {
        relay.answer(id: id, text: text)
        awaiting.remove(id.lowercased())
        if pill.alert?.id == id { apply(.page(PageMessage(phase: nil, alert: .clear))) }
    }

    private func apply(_ input: PillState.Input, kind: AlertKind? = nil) {
        let hadAlert = pill.alert
        pill.apply(input)
        if let alert = pill.notify, settings.agentAlerts { notifier.post(alert, kind: kind, sound: settings.alertSound) }
        guard pill.alert != hadAlert else { return }
        alertExpiry?.cancel()
        alertCollapse?.cancel()
        guard pill.alert != nil else { return }
        let work = DispatchWorkItem { [weak self] in self?.apply(.alertExpired) }  // never leave a stale alert on screen
        alertExpiry = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 120, execute: work)
        let collapse = DispatchWorkItem { [weak self] in self?.apply(.alertCollapsed) }  // the pill shrinks back; the alert stays in the panel
        alertCollapse = collapse
        DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: collapse)
    }

    /// Entering waits 300 ms so a mouse passing over the capsule does not flash it open; leaving is immediate.
    private func hover(_ inside: Bool) {
        hoverWork?.cancel()
        guard inside else { apply(.hover(false)); return }
        let work = DispatchWorkItem { [weak self] in self?.apply(.hover(true)) }
        hoverWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: work)
    }

    private func render() {
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: pill.phase.symbol, accessibilityDescription: "Terminal 1 \(pill.phase.rawValue)")
            button.contentTintColor = pill.phase == .listening ? .systemRed : nil
        }
        pillWindow.render(pill)
        Probe.log("icon=\(pill.phase.symbol) pill=\(pill.mode) \"\(pill.label)\" meter=\(pill.meterLive)")
    }

    @objc private func openSettings() { settingsWindow.show() }
    @objc private func togglePanel() { panel.setVisible(!panel.isVisible) }
    @objc private func reload() { panel.load() }
    @objc private func openDownload() {
        guard let url = UpdateCheck.endpoint("/download", page: configuredURL), NSWorkspace.shared.open(url) else {
            NSLog("Coworker: could not open the download page for \(configuredURL)")
            return
        }
    }
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

    /// Debug only: walks idle, hover, hold and alert, saving the pill's pixels after each settles.
    private func snapshotRun(_ dir: String) {
        pillWindow.onHover = nil  // a real mouse must not change the scripted states
        pillWindow.onClick = nil
        let steps: [(String, () -> Void)] = [
            ("idle", {}),
            ("hover", { self.apply(.hover(true)) }),
            ("hold", { self.apply(.hover(false)); self.apply(.talkDown); self.pillWindow.setLevel(0.7) }),
            ("release", { self.apply(.talkUp(cancelled: false)) }),
            ("alert", { self.simulateAlert() }),
            ("alert-collapsed", {}),
        ]
        var t = 1.0
        for (name, act) in steps {
            DispatchQueue.main.asyncAfter(deadline: .now() + t) { act() }
            t += name == "alert-collapsed" ? 8.5 : 0.6
            DispatchQueue.main.asyncAfter(deadline: .now() + t) { [weak self] in self?.pillWindow.snapshot(to: "\(dir)/\(name).png") }
            t += 0.3
        }
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
