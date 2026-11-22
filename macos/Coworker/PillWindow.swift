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
    override var mouseDownCanMoveWindow: Bool { false }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func mouseDown(with event: NSEvent) { onClick?() }
}

/// The Wispr-style pill: a non-activating panel at the bottom-center of the screen, above full-screen apps.
@MainActor
final class PillWindow {
    private static let compact = NSSize(width: 180, height: 44)
    private static let expanded = NSSize(width: 380, height: 60)

    var onClick: (() -> Void)? { get { content.onClick } set { content.onClick = newValue } }
    private let panel: NSPanel
    private let content = PillView()
    private let icon = NSImageView()
    private let meter = MeterView()
    private let label = NSTextField(wrappingLabelWithString: "")
    private lazy var labelMaxWidth = label.widthAnchor.constraint(lessThanOrEqualToConstant: 300)

    init() {
        panel = NSPanel(contentRect: NSRect(origin: .zero, size: Self.compact), styleMask: [.borderless, .nonactivatingPanel],
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

        let stack = NSStackView(views: [icon, meter, label])
        stack.orientation = .horizontal
        stack.spacing = 10
        stack.alignment = .centerY
        stack.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -16),
            stack.centerYAnchor.constraint(equalTo: content.centerYAnchor),
        ])
    }

    var isShown: Bool { panel.isVisible }

    func render(_ s: PillState) {
        guard s.mode != .hidden else { panel.orderOut(nil); return }
        let size = s.mode == .alert ? Self.expanded : Self.compact
        content.layer?.cornerRadius = s.mode == .alert ? 20 : size.height / 2
        labelMaxWidth.constant = size.width - 32 - 28 - 10
        label.preferredMaxLayoutWidth = labelMaxWidth.constant
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
        icon.image = NSImage(systemSymbolName: s.alert == nil ? s.phase.symbol : "bell.fill", accessibilityDescription: nil)
        icon.contentTintColor = s.alert == nil ? color : .systemYellow
        content.setAccessibilityLabel(s.label)
        if !s.meterLive { meter.level = 0 }

        if let screen = NSScreen.main?.visibleFrame {
            panel.setFrame(NSRect(x: screen.midX - size.width / 2, y: screen.minY + 14, width: size.width, height: size.height), display: true)
        }
        panel.orderFrontRegardless()
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
