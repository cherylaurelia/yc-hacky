// Spec: first launch walks through permissions, the talk key and connecting agents, skipping what is granted.
// Needs macos/Coworker/Onboarding.swift: enum OnboardingStep, struct Permissions(microphone:accessibility:inputMonitoring:),
// struct Onboarding { var step; init(); mutating func next(_ p: Permissions); static func needed(completed: Bool) -> Bool }.
// next() moves to the first later step whose permission is not granted (non-permission steps always count).
import Foundation

@main struct Spec {
    static func main() {
        var fails = 0
        func check(_ ok: Bool, _ m: String) { print(ok ? "ok   \(m)" : "FAIL \(m)"); if !ok { fails += 1 } }
        let none = Permissions(microphone: false, accessibility: false, inputMonitoring: false)
        let all = Permissions(microphone: true, accessibility: true, inputMonitoring: true)
        var o = Onboarding()
        check(o.step == .welcome, "starts at welcome")
        o.next(none); check(o.step == .microphone, "then the microphone")
        o.next(Permissions(microphone: true, accessibility: false, inputMonitoring: false)); check(o.step == .accessibility, "then accessibility")
        o.next(Permissions(microphone: true, accessibility: true, inputMonitoring: false)); check(o.step == .inputMonitoring, "then input monitoring")
        o.next(all); check(o.step == .talkKey, "then the talk key")
        o.next(all); check(o.step == .agents, "then connect agents")
        o.next(all); check(o.step == .done, "then done")
        o.next(all); check(o.step == .done, "done stays done")
        var g = Onboarding()
        g.next(all); check(g.step == .talkKey, "granted permissions are skipped")
        check(Onboarding.needed(completed: false) && !Onboarding.needed(completed: true), "shows once")
        exit(fails == 0 ? 0 : 1)
    }
}
