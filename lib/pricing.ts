// One source for plan names, prices and what each includes: the landing page and /pricing both read it.
export type Plan = { id: "free" | "pro" | "team"; name: string; price: string; per: string; note?: string; pitch: string; includes: string[] };

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    per: "forever",
    pitch: "Your agents can reach you.",
    includes: [
      "Agent alerts on your Mac, with Allow, Deny and Reply buttons",
      "Local relay and the coworker command for Claude Code, Codex, Cursor and scripts",
      "Team board on a GitHub issue",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$12",
    per: "per month",
    note: "or $96 a year",
    pitch: "Talk instead of type.",
    includes: [
      "Everything in Free",
      "Dictation into any app",
      "Hear your agents and answer them by voice",
      "Voice actions on GitHub: issues, pull requests, reviews, merges",
      "Spoken standup from your agents",
    ],
  },
  {
    id: "team",
    name: "Team",
    price: "$20",
    per: "per seat, per month",
    pitch: "Pro for everyone who runs agents.",
    includes: ["Everything in Pro, for every seat", "One invoice; add and remove seats any time", "Shared team board with a voice for each agent"],
  },
];
