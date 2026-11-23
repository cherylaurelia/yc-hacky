import AppKit

/// A small native window over AppSettings. Every control saves at once; there is no Apply button.
@MainActor
final class SettingsWindow: NSObject {
    var onChange: ((AppSettings) -> Void)?
    var license: LicenseManager?

    private static let languages = [("auto", "Detect automatically"), ("en", "English"), ("es", "Spanish"), ("fr", "French"), ("de", "German"),
                                    ("pt", "Portuguese"), ("it", "Italian"), ("ja", "Japanese"), ("ko", "Korean"), ("zh", "Chinese"), ("hi", "Hindi")]

    private let talkKey = NSPopUpButton()
    private let language = NSPopUpButton()
    private let alerts = NSButton(checkboxWithTitle: "Notify me when an agent needs me", target: nil, action: nil)
    private let sound = NSButton(checkboxWithTitle: "Play a sound with agent alerts", target: nil, action: nil)
    private let login = NSButton(checkboxWithTitle: "Open Coworker at login", target: nil, action: nil)
    private let licenseKey = NSTextField()
    private let activateButton = NSButton(title: "Activate", target: nil, action: nil)
    private let deactivateButton = NSButton(title: "Deactivate", target: nil, action: nil)
    private let licenseStatus = NSTextField(wrappingLabelWithString: "")
    private lazy var window = makeWindow()

    /// Reads the saved settings each time, so a change made from the menu shows up here.
    func show() {
        let s = AppSettings.load()
        talkKey.selectItem(at: TalkKey.allCases.firstIndex(of: s.talkKey) ?? 0)
        language.selectItem(at: Self.languages.firstIndex { $0.0 == s.dictationLanguage } ?? 0)
        alerts.state = s.agentAlerts ? .on : .off
        sound.state = s.alertSound ? .on : .off
        login.state = LoginItem.enabled ? .on : .off  // what macOS says, not what we last saved
        refreshLicense()
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
    }

    /// Shows the license state, or `problem` (red) when the last button press failed.
    private func refreshLicense(_ problem: String? = nil) {
        let state = license?.state ?? .unlicensed
        licenseStatus.stringValue = problem ?? state.summary
        if problem != nil { licenseStatus.textColor = .systemRed } else if case .invalid = state { licenseStatus.textColor = .systemRed } else { licenseStatus.textColor = .secondaryLabelColor }
        activateButton.isEnabled = true
        deactivateButton.isEnabled = license?.key != nil
        window.setContentSize(window.contentView?.fittingSize ?? window.frame.size)
    }

    @objc private func activate() {
        let key = licenseKey.stringValue
        guard let license, !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        activateButton.isEnabled = false
        deactivateButton.isEnabled = false
        licenseStatus.stringValue = "Checking..."
        Task {
            let problem = await license.activate(key)
            if problem == nil { licenseKey.stringValue = "" }
            refreshLicense(problem)
        }
    }

    @objc private func deactivate() {
        guard let license else { return }
        activateButton.isEnabled = false
        deactivateButton.isEnabled = false
        licenseStatus.stringValue = "Checking..."
        Task { refreshLicense(await license.deactivate()) }
    }

    @objc private func changed() {
        var s = AppSettings.load()
        s.talkKey = TalkKey.allCases[max(0, talkKey.indexOfSelectedItem)]
        s.dictationLanguage = Self.languages[max(0, language.indexOfSelectedItem)].0
        s.agentAlerts = alerts.state == .on
        s.alertSound = sound.state == .on
        if (login.state == .on) != LoginItem.enabled { LoginItem.apply(login.state == .on) }
        s.launchAtLogin = LoginItem.enabled
        login.state = s.launchAtLogin ? .on : .off  // snaps back when macOS refused
        s.save()
        onChange?(s)
    }

    private func makeWindow() -> NSWindow {
        talkKey.addItems(withTitles: TalkKey.allCases.map(\.title))
        language.addItems(withTitles: Self.languages.map(\.1))
        for control in [talkKey, language, alerts, sound, login] as [NSControl] {
            control.target = self
            control.action = #selector(changed)
        }
        licenseKey.placeholderString = "License key"
        licenseKey.widthAnchor.constraint(equalToConstant: 260).isActive = true
        licenseKey.target = self
        licenseKey.action = #selector(activate)  // Return in the field
        activateButton.target = self
        activateButton.action = #selector(activate)
        deactivateButton.target = self
        deactivateButton.action = #selector(deactivate)
        licenseStatus.preferredMaxLayoutWidth = 260
        licenseStatus.font = .systemFont(ofSize: NSFont.smallSystemFontSize)
        let grid = NSGridView(views: [
            [NSTextField(labelWithString: "Talk key"), talkKey],
            [NSTextField(labelWithString: "Dictation language"), language],
            [NSGridCell.emptyContentView, alerts],
            [NSGridCell.emptyContentView, sound],
            [NSGridCell.emptyContentView, login],
            [NSTextField(labelWithString: "License"), licenseKey],
            [NSGridCell.emptyContentView, NSStackView(views: [activateButton, deactivateButton])],
            [NSGridCell.emptyContentView, licenseStatus],
        ])
        grid.rowSpacing = 12
        grid.columnSpacing = 12
        grid.column(at: 0).xPlacement = .trailing
        grid.translatesAutoresizingMaskIntoConstraints = false

        let content = NSView()
        content.addSubview(grid)
        NSLayoutConstraint.activate([
            grid.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 24), grid.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -24),
            grid.topAnchor.constraint(equalTo: content.topAnchor, constant: 24), grid.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -24),
        ])
        let w = NSWindow(contentRect: .zero, styleMask: [.titled, .closable], backing: .buffered, defer: false)
        w.title = "Coworker Settings"
        w.isReleasedWhenClosed = false
        w.contentView = content
        w.setContentSize(content.fittingSize)
        w.center()
        return w
    }
}
