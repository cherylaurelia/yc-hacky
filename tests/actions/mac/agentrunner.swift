// Spec: the app starts `coworker run` through the user's login shell (GUI apps lack the shell PATH that finds
// claude, codex and gh), with the task as its own argv element so it is never parsed by a shell.
// Needs macos/Coworker/AgentRunner.swift: enum AgentRunner { static func arguments(cli:task:agent:repo:) -> [String] }
// where arguments[0] is the executable path.
import Foundation

@main struct Spec {
    static func main() {
        var fails = 0
        func check(_ ok: Bool, _ m: String) { print(ok ? "ok   \(m)" : "FAIL \(m)"); if !ok { fails += 1 } }
        let evil = "fix it\"; rm -rf ~; echo \"$(whoami)"
        let a = AgentRunner.arguments(cli: "/Apps/Coworker.app/Contents/Resources/bin/coworker", task: evil, agent: "codex", repo: "acme/widgets")
        check(["/bin/zsh", "/bin/bash"].contains(a.first ?? ""), "runs through a shell binary")
        check(a.contains { $0.hasPrefix("-") && $0.contains("l") && !$0.contains(" ") }, "as a login shell (-l / -lc)")
        check(a.last == evil, "the task is the last argument, verbatim")
        check(!(a.dropLast().contains { $0.contains("rm -rf") }), "the task is not inside the shell script")
        check(a.contains("/Apps/Coworker.app/Contents/Resources/bin/coworker"), "runs the bundled CLI")
        check(a.contains("run") && a.contains("--detach"), "coworker run --detach")
        if let i = a.firstIndex(of: "--agent") { check(a[i + 1] == "codex", "agent passed") } else { check(false, "--agent") }
        if let i = a.firstIndex(of: "--repo") { check(a[i + 1] == "acme/widgets", "repo passed") } else { check(false, "--repo") }
        exit(fails == 0 ? 0 : 1)
    }
}
