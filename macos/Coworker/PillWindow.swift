import AppKit
import AVFoundation

/// Five bars that follow a 0...1 level.
private final class MeterView: NSView {
    var level: CGFloat = 0 { didSet { needsDisplay = true } }
    var color = NSColor.systemRed
    private let shape: [CGFloat] = [0.55, 0.85, 1, 0.85, 0.55]
    override var intrinsicContentSize: NSSize { NSSize(width: 34, height: 24) }

    override func draw(_ dirtyRect: NSRect) {
        color.setFill()
        let w: CGFloat = 4, gap: CGFloat = 3.5
        for (i, s) in shape.enumerated() {
            let h = max(4, bounds.height * min(1, level * s * 1.25))
            let r = NSRect(x: CGFloat(i) * (w + gap), y: (bounds.height - h) / 2, width: w, height: h)
            NSBezierPath(roundedRect: r, xRadius: w / 2, yRadius: w / 2).fill()
        }
    }
}

private final class PillView: NSView {
    var onClick: (() -> Void)?
    var onHover: ((Bool) -> Void)?
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self))
    }
    override func mouseEntered(with event: NSEvent) { onHover?(true) }
    override func mouseExited(with event: NSEvent) { onHover?(false) }
    override var mouseDownCanMoveWindow: Bool { false }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func mouseDown(with event: NSEvent) { onClick?() }
}

/// The Wispr-style pill: a non-activating panel at the bottom-center of the screen, above full-screen apps.
/// Idle it is a 44x8 capsule; hover, the talk key and alerts grow it upward from the same spot.
@MainActor
final class PillWindow {
    private static let idle = NSSize(width: 44, height: 8)
    private static let active = NSSize(width: 180, height: 44)
    private static let alert = NSSize(width: 380, height: 60)
    private static let hintHeight: CGFloat = 34
    private static let bottomGap: CGFloat = 8
    private static let growDuration: TimeInterval = 0.18

    var onClick: (() -> Void)? { get { content.onClick } set { content.onClick = newValue } }
    var onHover: ((Bool) -> Void)? { get { content.onHover } set { content.onHover = newValue } }
    private let stack = NSStackView()
    private var lastState: PillState?
    private let panel: NSPanel
    private let content = PillView()
    private let icon = NSImageView()
    private let meter = MeterView()
    private let label = NSTextField(wrappingLabelWithString: "")
    private lazy var labelMaxWidth = label.widthAnchor.constraint(lessThanOrEqualToConstant: 300)

    init() {
        panel = NSPanel(contentRect: NSRect(origin: .zero, size: Self.idle), styleMask: [.borderless, .nonactivatingPanel],
                        backing: .buffered, defer: false)
        panel.isFloatingPanel = true
        panel.level = .statusBar
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.contentView = content

        content.wantsLayer = true
        content.layer?.backgroundColor = NSColor(white: 0.08, alpha: 0.92).cgColor
        content.layer?.borderColor = NSColor(white: 1, alpha: 0.14).cgColor
        content.layer?.borderWidth = 1
        content.layer?.cornerRadius = 22  // Core Animation clamps this to half the height, so every size stays a capsule
        content.layer?.masksToBounds = true  // the label is clipped while the capsule is still growing
        content.setAccessibilityRole(.button)

        label.font = .systemFont(ofSize: 12.5, weight: .medium)
        label.textColor = .white
        label.maximumNumberOfLines = 2
        label.lineBreakMode = .byWordWrapping
        label.cell?.truncatesLastVisibleLine = true
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        labelMaxWidth.isActive = true
        icon.imageScaling = .scaleProportionallyUpOrDown
        icon.widthAnchor.constraint(equalToConstant: 18).isActive = true
        icon.heightAnchor.constraint(equalToConstant: 18).isActive = true

        for v in [icon, meter, label] { stack.addArrangedSubview(v) }
        stack.orientation = .horizontal
        stack.spacing = 10
        stack.alignment = .centerY
        stack.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: content.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: content.centerYAnchor),
        ])
        NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { if let s = self?.lastState { self?.render(s) } }
        }
    }

    var isShown: Bool { panel.isVisible }

    func render(_ s: PillState) {
        lastState = s
        guard s.mode != .hidden else { panel.orderOut(nil); return }
        let compact = s.mode == .compact
        label.stringValue = s.label
        label.invalidateIntrinsicContentSize()
        meter.isHidden = !s.meterLive
        icon.isHidden = s.meterLive
        let color: NSColor = switch s.phase {
        case .idle: .secondaryLabelColor
        case .listening: .systemRed
        case .thinking: .systemOrange
        case .speaking: .systemGreen
        }
        meter.color = color
        icon.image = NSImage(systemSymbolName: s.alert == nil || s.mode != .alert ? s.phase.symbol : "bell.fill", accessibilityDescription: nil)
        icon.contentTintColor = s.mode == .alert ? .systemYellow : color
        content.setAccessibilityLabel(s.label)
        if !s.meterLive { meter.level = 0 }

        let size: NSSize
        switch s.mode {
        case .alert: size = Self.alert
        case .active: size = Self.active
        case .hint:
            label.preferredMaxLayoutWidth = 0
            labelMaxWidth.constant = 400
            size = NSSize(width: ceil(label.intrinsicContentSize.width) + 32 + 28, height: Self.hintHeight)
        default: size = Self.idle
        }
        if s.mode == .alert || s.mode == .active {
            labelMaxWidth.constant = size.width - 32 - 28 - 10
            label.preferredMaxLayoutWidth = labelMaxWidth.constant
        }
        panel.hasShadow = !compact
        guard let screen = NSScreen.main?.visibleFrame else { return }
        let frame = NSRect(x: screen.midX - size.width / 2, y: screen.minY + Self.bottomGap, width: size.width, height: size.height)
        let alpha: CGFloat = compact ? 0.7 : 1
        let wasShown = panel.isVisible
        panel.orderFrontRegardless()
        if !wasShown || NSWorkspace.shared.accessibilityDisplayShouldReduceMotion || frame == panel.frame {
            panel.setFrame(frame, display: true)
            panel.alphaValue = alpha
            stack.alphaValue = compact ? 0 : 1
            return
        }
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = Self.growDuration
            ctx.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            panel.animator().setFrame(frame, display: true)
            panel.animator().alphaValue = alpha
            stack.animator().alphaValue = compact ? 0 : 1
        }
    }

    /// Debug only: writes the pill's own pixels to a PNG (works without Screen Recording access) and logs where the panel sits.
    func snapshot(to path: String) {
        let size = content.bounds.size
        guard let rep = content.bitmapImageRepForCachingDisplay(in: content.bounds), let png: Data = {
            content.cacheDisplay(in: content.bounds, to: rep)
            return rep.representation(using: .png, properties: [:])
        }() else { NSLog("Coworker: snapshot failed for \(path)"); return }
        do { try png.write(to: URL(fileURLWithPath: path)) } catch { NSLog("Coworker: snapshot write failed: \(error)"); return }
        let visible = NSScreen.main?.visibleFrame ?? .zero
        NSLog("Coworker: snapshot \(path) size=\(size) frame=\(panel.frame) gapAboveVisibleBottom=\(panel.frame.minY - visible.minY) alpha=\(panel.alphaValue)")
    }

    func setLevel(_ level: Float) { meter.level = CGFloat(level) }
}

/// Reads the mic level while the talk key is held. It runs only for the hold, so the mic indicator is off otherwise.
@MainActor
final class MicLevel {
    var onLevel: ((Float) -> Void)?
    private let engine = AVAudioEngine()
    private var running = false
    private var smooth: Float = 0
    private var peak: Float = 0
    private var buffers = 0

    func start() {
        guard !running else { return }
        guard AVCaptureDevice.authorizationStatus(for: .audio) == .authorized else {
            Probe.log("mic meter off: microphone access is \(AVCaptureDevice.authorizationStatus(for: .audio).rawValue)")
            return
        }
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { NSLog("Coworker: no usable input device for the level meter"); return }
        smooth = 0
        peak = 0
        buffers = 0
        input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in
            guard let data = buffer.floatChannelData?[0] else { return }
            let n = Int(buffer.frameLength)
            var sum: Float = 0
            for i in 0..<n { sum += data[i] * data[i] }
            let level = Meter.level(rms: n > 0 ? (sum / Float(n)).squareRoot() : 0)
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.push(level) } }
        }
        do {
            try engine.start()
            running = true
        } catch {
            input.removeTap(onBus: 0)
            NSLog("Coworker: could not start the level meter: \(error.localizedDescription)")
        }
    }

    func stop() {
        guard running else { return }
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        running = false
        Probe.log("mic meter: \(buffers) buffers, peak level \(peak)")
        onLevel?(0)
    }

    private func push(_ level: Float) {
        guard running else { return }
        buffers += 1
        peak = max(peak, level)
        smooth = max(level, smooth * 0.75)
        onLevel?(smooth)
    }
}
