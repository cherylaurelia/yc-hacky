import AppKit
import AVFoundation

enum OnboardingStep: Int, CaseIterable { case welcome, microphone, accessibility, inputMonitoring, talkKey, agents, done }

struct Permissions {
    var microphone: Bool
    var accessibility: Bool
    var inputMonitoring: Bool

    static var current: Permissions {
        Permissions(microphone: AVCaptureDevice.authorizationStatus(for: .audio) == .authorized,
                    accessibility: AXIsProcessTrusted(), inputMonitoring: CGPreflightListenEventAccess())
    }

    /// Only a permission step can be already done; every other step is always shown.
    fileprivate func granted(_ step: OnboardingStep) -> Bool {
        switch step {
        case .microphone: microphone
        case .accessibility: accessibility
        case .inputMonitoring: inputMonitoring
        default: false
        }
    }
}

/// First launch: permissions, the talk key, connecting agents. Pure, so the window only draws `step`.
struct Onboarding {
    var step = OnboardingStep.welcome

    mutating func next(_ p: Permissions) {
        step = OnboardingStep.allCases.first { $0.rawValue > step.rawValue && !p.granted($0) } ?? step
    }

    static func needed(completed: Bool) -> Bool { !completed }
}
