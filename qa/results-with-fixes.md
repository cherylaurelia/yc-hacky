# Voice agent QA results

Agent agent_1101m825506terdr2rnep3ga07r1, text mode, real tools against http://localhost:3200, board #4 of cherylaurelia/yc-hacky. 2 runs per scenario, 2026-11-22T17:36:57.980Z.

Scenario pass: 27/28. Voice-safe (every spoken turn at most 3 sentences, no URLs, hashes, markdown, tool names or request ids): 27/28.
Latency to first agent reply after the first input (includes tool calls): median 0.8s, p90 2.4s, max 3.4s. Over every turn: median 1.3s, p90 2.4s.

| scenario | pass | voice-safe | first reply (median) | failing checks |
|---|---|---|---|---|
| digest | 2/2 | 2/2 | 1.7s | none |
| since-11-repo | 2/2 | 2/2 | 2.4s | none |
| approval-allow | 2/2 | 2/2 | 0.7s | none |
| approval-deny | 2/2 | 2/2 | 0.6s | none |
| stuck-stop | 2/2 | 2/2 | 0.7s | none |
| stuck-leave | 2/2 | 2/2 | 0.8s | none |
| show-me | 2/2 | 2/2 | 0.5s | none |
| relay | 2/2 | 2/2 | 0.6s | none |
| read-only-write | 2/2 | 2/2 | 0.7s | none |
| ambiguous | 2/2 | 2/2 | 0.5s | none |
| two-alerts | 2/2 | 2/2 | 2.3s | none |
| mention-alert | 2/2 | 2/2 | 0.9s | none |
| out-of-scope | 2/2 | 2/2 | 1.1s | none |
| long-winded | 1/2 | 1/2 | 2.4s | step 2: three sentences or fewer (got 4); voice step 2: more than 3 sentences (4) |

## Transcripts

<details><summary>PASS digest run 1 (15s)</summary>

```
+0.4s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.9s USER : What are the agents up to?
+5.1s   [tool] board_digest({"board":4}) -> The board has been quiet for the last 60 minutes. No agent has posted. (488 ms)
+5.7s AGENT: The board's been quiet for the last hour. No agent has posted anything.
+9.2s USER : Anything from the agents on the board since 11?
+10.5s   [tool] board_digest({"since_minutes":94,"board":4}) -> In the last 94 minutes, 5 agents posted 14 times. Blocked or waiting: Cheryl's Claude, 1 hour ago: blocked: no PR was opened for "blocked-path retest, rename the app title to Foo (3s timeout)" (claude exit 124); Cheryl's (452 ms)
+11.7s AGENT: Five agents posted 14 times. Cheryl's Claude hit blocked states about an hour ago on the title rename to Foo, because its 3-second timeout opened no PR. Its latest post is done, with the metadata description change in PR number 6.
```

</details>

<details><summary>PASS digest run 2 (15s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.9s USER : Catch me up.
+5.0s   [tool] board_digest({"board":4}) -> The board has been quiet for the last 60 minutes. No agent has posted. (472 ms)
+5.9s AGENT: Nothing from the agents in the last hour. The board's been quiet, and nothing is blocked or waiting on you.
+9.4s USER : What have the agents done since 11?
+10.8s   [tool] board_digest({"since_minutes":94,"board":4}) -> In the last 94 minutes, 5 agents posted 14 times. Blocked or waiting: Cheryl's Claude, 1 hour ago: blocked: no PR was opened for "blocked-path retest, rename the app title to Foo (3s timeout)" (claude exit 124); Cheryl's (399 ms)
+11.8s AGENT: Five agents posted 14 times. Cheryl's Claude was blocked an hour ago on the rename-app-title-to-Foo task, since no PR opened. It later finished the page description change as number 6.
```

</details>

<details><summary>PASS since-11-repo run 1 (10s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.9s USER : What happened in the repo since 11?
+5.2s   [tool] recent_activity({"hours":2}) -> In the last 2 hours: 34 commits on the default branch (cherylaurelia 34). Latest: feat(demo): one-command live scenario with reset and a 3-minute... by cherylaurelia, 7 minutes ago; feat(ui): calm light Coworker page wit (337 ms)
+6.3s AGENT: Cherylaurelia pushed 34 commits, the latest seven minutes ago: a one-command live demo scenario. Three pull requests were opened, including number 8, a Chrome extension popup from aidanyee17. Two Safari login issues were opened and then closed.
```

</details>

<details><summary>PASS since-11-repo run 2 (10s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.9s USER : What did we push since 11?
+5.3s   [tool] recent_activity({"hours":2}) -> In the last 2 hours: 34 commits on the default branch (cherylaurelia 34). Latest: feat(demo): one-command live scenario with reset and a 3-minute... by cherylaurelia, 7 minutes ago; feat(ui): calm light Coworker page wit (324 ms)
+6.3s AGENT: Cherylaurelia pushed 34 commits, the latest seven minutes ago: a one-command live demo scenario. Before that came the calm light Coworker page and the macOS floating pill. Three pull requests are open, including number 8, Aidan's Chrome extension popup.
```

</details>

<details><summary>PASS approval-allow run 1 (16s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.9s ALERT: [BOARD ALERT] Aidan's Claude (GitHub login cherylaurelia) is blocked or waiting: "needs approval (req 7c3e91): Bash npm install zod in yc-hacky"
+4.6s AGENT: Aidan's Claude wants to run an npm install of zod. Allow?
+8.1s USER : Yes, go ahead.
+9.5s   [tool] answer_request({"request_id":"7c3e91","decision":"allow","board":4}) -> Sent allow for request 7c3e91. (560 ms)
+10.0s AGENT: Allowed.
+16.1s   [cleanup] deleted board comments 7082943180
```

</details>

<details><summary>PASS approval-allow run 2 (17s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.8s ALERT: [BOARD ALERT] Aidan's Claude (GitHub login cherylaurelia) is blocked or waiting: "needs approval (req 7c3e91): Bash npm install zod in yc-hacky"
+4.6s AGENT: Aidan's Claude wants to run npm install zod. Allow?
+8.2s USER : Sure, do it.
+9.5s   [tool] answer_request({"request_id":"7c3e91","decision":"allow","board":4}) -> Sent allow for request 7c3e91. (526 ms)
+10.1s AGENT: Allowed.
+16.9s   [cleanup] deleted board comments 7082943141
```

</details>

<details><summary>PASS approval-deny run 1 (16s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.9s ALERT: [BOARD ALERT] Aidan's Claude (GitHub login cherylaurelia) is blocked or waiting: "needs approval (req 2b8d4f): Bash rm -rf node_modules in yc-hacky" / The user already heard the post above aloud in the poster's own voice. Do not say what it says or needs, and do not summarize it. Reply with one short question only: "What should I tell Aidan's Claude?" If it says "needs approval (req X)", reply only: "Allow?"
+4.7s AGENT: Allow?
+8.3s USER : No, don't. Wrong folder.
+9.7s   [tool] answer_request({"request_id":"2b8d4f","decision":"deny","note":"wrong folder","board":4}) -> Sent deny for request 2b8d4f. (448 ms)
+10.2s AGENT: Denied.
+16.2s   [cleanup] deleted board comments 7082944120
```

</details>

<details><summary>PASS approval-deny run 2 (17s)</summary>

```
+1.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+4.9s ALERT: [BOARD ALERT] Aidan's Claude (GitHub login cherylaurelia) is blocked or waiting: "needs approval (req 2b8d4f): Bash rm -rf node_modules in yc-hacky" / The user already heard the post above aloud in the poster's own voice. Do not say what it says or needs, and do not summarize it. Reply with one short question only: "What should I tell Aidan's Claude?" If it says "needs approval (req X)", reply only: "Allow?"
+5.5s AGENT: Allow?
+9.0s USER : Deny it, it's the wrong folder.
+10.5s   [tool] answer_request({"request_id":"2b8d4f","decision":"deny","note":"wrong folder","board":4}) -> Sent deny for request 2b8d4f. (491 ms)
+11.0s AGENT: Denied.
+17.0s   [cleanup] deleted board comments 7082946764
```

</details>

<details><summary>PASS stuck-stop run 1 (21s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+4.0s ALERT: [BOARD ALERT] Eithan's Claude (GitHub login cherylaurelia) is blocked or waiting: "stuck: retried npm test 6 times in 20 min, about $8.40 so far (req 5e0f2a)" Retried 6 times over 20 minutes, about 8 dollars.
+4.7s AGENT: Eithan's Claude has retried the same failing npm test 6 times in 20 minutes, about 8 dollars. Want me to stop it?
+8.2s USER : Yes, stop it.
+9.6s   [tool] answer_request({"request_id":"5e0f2a","decision":"stop","board":4}) -> Sent stop for request 5e0f2a. (591 ms)
+10.0s AGENT: Stopped.
+13.7s USER : Yes, stop it.
+14.8s AGENT: It's already stopped. I sent the stop a moment ago.
+20.7s   [cleanup] deleted board comments 7082947484
```

</details>

<details><summary>PASS stuck-stop run 2 (21s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.9s ALERT: [BOARD ALERT] Eithan's Claude (GitHub login cherylaurelia) is blocked or waiting: "stuck: retried npm test 6 times in 20 min, about $8.40 so far (req 5e0f2a)" Retried 6 times over 20 minutes, about 8 dollars.
+4.7s AGENT: Eithan's Claude has retried the same failing npm test 6 times in 20 minutes, about 8 dollars. Want me to stop it?
+8.3s USER : Yes, stop it.
+9.5s   [tool] answer_request({"request_id":"5e0f2a","decision":"stop","board":4}) -> Sent stop for request 5e0f2a. (461 ms)
+10.1s AGENT: Stopped.
+13.6s USER : Yes, stop it.
+14.7s AGENT: I already stopped it. The stop went through a moment ago.
+20.7s   [cleanup] deleted board comments 7082946760
```

</details>

<details><summary>PASS stuck-leave run 1 (13s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+4.7s ALERT: [BOARD ALERT] Eithan's Claude (GitHub login cherylaurelia) is blocked or waiting: "stuck: retried pytest 4 times in 12 min, about $3.10 so far (req 8d1c77)" Retried 4 times over 12 minutes, about 3 dollars.
+5.5s AGENT: Eithan's Claude has retried the same failing pytest 4 times in 12 minutes, about 3 dollars. Want me to stop it?
+9.1s USER : No, leave it.
+9.6s AGENT: Okay, leaving it.
```

</details>

<details><summary>PASS stuck-leave run 2 (13s)</summary>

```
+0.2s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.8s ALERT: [BOARD ALERT] Eithan's Claude (GitHub login cherylaurelia) is blocked or waiting: "stuck: retried pytest 4 times in 12 min, about $3.10 so far (req 8d1c77)" Retried 4 times over 12 minutes, about 3 dollars.
+4.9s AGENT: Eithan's Claude has retried the same failing pytest 4 times in 12 minutes, about 3 dollars. Want me to stop it?
+8.5s USER : Nah, let it run.
+9.0s AGENT: Okay, leaving it.
```

</details>

<details><summary>PASS show-me run 1 (21s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.9s ALERT: [BOARD ALERT] Aidan's Claude (GitHub login cherylaurelia) is blocked or waiting: "needs approval (req 41ac9e): Edit app/login/page.tsx in yc-hacky" / The user already heard the post above aloud in the poster's own voice. Do not say what it says or needs, and do not summarize it. Reply with one short question only: "What should I tell Aidan's Claude?" If it says "needs approval (req X)", reply only: "Allow?"
+4.4s AGENT: Allow?
+7.9s USER : Show me.
+8.8s   [tool] show_me({"agent":"Aidan's Claude","req":"41ac9e"}) -> Showing the approval from Aidan's Claude on screen, with its diff. (0 ms)
+9.3s AGENT: Here's the diff.
+12.9s USER : Okay, allow it.
+14.3s   [tool] answer_request({"request_id":"41ac9e","decision":"allow","board":4}) -> Sent allow for request 41ac9e. (553 ms)
+14.8s AGENT: Allowed.
+20.7s   [cleanup] deleted board comments 7082953849
```

</details>

<details><summary>PASS show-me run 2 (21s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.9s ALERT: [BOARD ALERT] Aidan's Claude (GitHub login cherylaurelia) is blocked or waiting: "needs approval (req 41ac9e): Edit app/login/page.tsx in yc-hacky" / The user already heard the post above aloud in the poster's own voice. Do not say what it says or needs, and do not summarize it. Reply with one short question only: "What should I tell Aidan's Claude?" If it says "needs approval (req X)", reply only: "Allow?"
+4.5s AGENT: Allow?
+8.0s USER : What's the diff?
+8.8s   [tool] show_me({"agent":"Aidan's Claude","req":"41ac9e"}) -> Showing the approval from Aidan's Claude on screen, with its diff. (0 ms)
+9.3s AGENT: Here's the diff.
+12.8s USER : Okay, allow it.
+14.2s   [tool] answer_request({"request_id":"41ac9e","decision":"allow","board":4}) -> Sent allow for request 41ac9e. (606 ms)
+14.7s AGENT: Allowed.
+20.7s   [cleanup] deleted board comments 7082952840
```

</details>

<details><summary>PASS relay run 1 (20s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.8s ALERT: [BOARD ALERT] Eithan's Codex (GitHub login cherylaurelia) is blocked or waiting: "blocked: should the call API return 202 or 200 when the call is queued? Waiting on your answer before I wire the client." / The user already heard the post above aloud in the poster's own voice. Do not say what it says or needs, and do not summarize it. Reply with one short question only: "What should I tell Eithan's Codex?" If it says "needs approval (req X)", reply only: "Allow?"
+4.4s AGENT: What should I tell Eithan's Codex?
+8.1s USER : Tell it to return 202.
+8.7s AGENT: I'll tell Eithan's Codex: return 202. Should I send it?
+12.3s USER : Yes.
+13.7s   [tool] board_post({"text":"Eithan's Codex, return 202 when the call is queued.","to":"cherylaurelia","board":4}) -> Posted to the board for cherylaurelia. (478 ms)
+14.2s AGENT: Sent.
+20.3s   [cleanup] deleted board comments 7082954648
```

</details>

<details><summary>PASS relay run 2 (21s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.9s ALERT: [BOARD ALERT] Eithan's Codex (GitHub login cherylaurelia) is blocked or waiting: "blocked: should the call API return 202 or 200 when the call is queued? Waiting on your answer before I wire the client." / The user already heard the post above aloud in the poster's own voice. Do not say what it says or needs, and do not summarize it. Reply with one short question only: "What should I tell Eithan's Codex?" If it says "needs approval (req X)", reply only: "Allow?"
+5.0s AGENT: What should I tell Eithan's Codex?
+8.7s USER : Say 202.
+9.3s AGENT: I'll tell Eithan's Codex: 202. Send it?
+12.9s USER : Yeah, send it.
+14.4s   [tool] board_post({"text":"Eithan's Codex, return 202 when the call is queued.","to":"cherylaurelia","board":4}) -> Posted to the board for cherylaurelia. (519 ms)
+15.1s AGENT: Sent.
+21.2s   [cleanup] deleted board comments 7082957181
```

</details>

<details><summary>PASS read-only-write run 1 (14s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into octocat/Hello-World and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.9s USER : Comment on issue 1 saying thanks for the report.
+4.7s AGENT: I'll comment on number 1: "Thanks for the report." Want me to post that?
+8.2s USER : Yes.
+9.3s   [tool] add_comment({"number":1,"body":"Thanks for the report."}) -> ERROR I can read this repo but I can't write to it yet. Sign in with GitHub and I'll write as you. (250 ms)
+9.3s   [error] Client tool execution failed with following error: I can read this repo but I can't write to it yet. Sign in with GitHub and I'll write as you.
+10.3s AGENT: I couldn't post the comment. I can read the repo but can't write to it yet. Sign in with GitHub and I'll write as you, then ask me again.
```

</details>

<details><summary>PASS read-only-write run 2 (13s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into octocat/Hello-World and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.9s USER : Comment on issue 1 saying thanks for the report.
+4.6s AGENT: I'll comment on issue 1: "Thanks for the report." Want me to post it?
+8.3s USER : Yes.
+9.1s   [tool] add_comment({"number":1,"body":"Thanks for the report."}) -> ERROR I can read this repo but I can't write to it yet. Sign in with GitHub and I'll write as you. (12 ms)
+9.1s   [error] Client tool execution failed with following error: I can read this repo but I can't write to it yet. Sign in with GitHub and I'll write as you.
+9.7s AGENT: I couldn't post the comment. I can read the repo but not write to it yet. Sign in with GitHub and I'll try again.
```

</details>

<details><summary>PASS ambiguous run 1 (21s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.9s ALERT: [BOARD ALERT] Aidan's Claude (GitHub login cherylaurelia) is blocked or waiting: "needs approval (req d00d17): Bash git push origin main in yc-hacky" / The user already heard the post above aloud in the poster's own voice. Do not say what it says or needs, and do not summarize it. Reply with one short question only: "What should I tell Aidan's Claude?" If it says "needs approval (req X)", reply only: "Allow?"
+4.5s AGENT: Allow?
+8.1s USER : Hmm, maybe.
+9.3s AGENT: Should I allow it or deny it?
+12.8s USER : Okay yes, allow it.
+14.3s   [tool] answer_request({"request_id":"d00d17","decision":"allow","board":4}) -> Sent allow for request d00d17. (662 ms)
+14.8s AGENT: Allowed.
+20.9s   [cleanup] deleted board comments 7082961982
```

</details>

<details><summary>PASS ambiguous run 2 (22s)</summary>

```
+0.4s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+4.0s ALERT: [BOARD ALERT] Aidan's Claude (GitHub login cherylaurelia) is blocked or waiting: "needs approval (req d00d17): Bash git push origin main in yc-hacky" / The user already heard the post above aloud in the poster's own voice. Do not say what it says or needs, and do not summarize it. Reply with one short question only: "What should I tell Aidan's Claude?" If it says "needs approval (req X)", reply only: "Allow?"
+4.5s AGENT: Allow?
+8.0s USER : I'm not sure, hmm.
+10.6s AGENT: No rush. Should I allow or deny the push, or do you want to see the diff first?
+14.2s USER : Okay yes, allow it.
+15.5s   [tool] answer_request({"request_id":"d00d17","decision":"allow","board":4}) -> Sent allow for request d00d17. (501 ms)
+16.0s AGENT: Allowed.
+22.1s   [cleanup] deleted board comments 7082961285
```

</details>

<details><summary>PASS two-alerts run 1 (19s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.9s ALERT: [BOARD ALERT] Eithan's Codex (GitHub login cherylaurelia) is blocked or waiting: "blocked: should the call API return 202 or 200? Waiting on your answer before I wire the client." / Aidan's Claude (GitHub login cherylaurelia) is blocked or waiting: "needs approval (req 9a6b30): Bash npx prisma migrate dev in yc-hacky"
+7.3s AGENT: Eithan's Codex is blocked and asks whether the call API should return 202 or 200. Aidan's Claude wants to run a Prisma migrate dev command. Do you allow that, and what should I tell Codex?
+10.8s USER : Allow the migration.
+12.3s   [tool] answer_request({"request_id":"9a6b30","decision":"allow","board":4}) -> Sent allow for request 9a6b30. (708 ms)
+13.0s AGENT: Allowed. What should I tell Eithan's Codex, 202 or 200?
+19.0s   [cleanup] deleted board comments 7082961451
```

</details>

<details><summary>PASS two-alerts run 2 (19s)</summary>

```
+1.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+4.8s ALERT: [BOARD ALERT] Eithan's Codex (GitHub login cherylaurelia) is blocked or waiting: "blocked: should the call API return 202 or 200? Waiting on your answer before I wire the client." / Aidan's Claude (GitHub login cherylaurelia) is blocked or waiting: "needs approval (req 9a6b30): Bash npx prisma migrate dev in yc-hacky"
+7.1s AGENT: Eithan's Codex is blocked: should the call API return 202 or 200? Aidan's Claude wants to run a Prisma database migration. Do you want to allow that, and what should I tell Eithan's Codex?
+10.6s USER : Allow the migration.
+12.2s   [tool] answer_request({"request_id":"9a6b30","decision":"allow","board":4}) -> Sent allow for request 9a6b30. (712 ms)
+12.8s AGENT: Allowed. What should I tell Eithan's Codex about 202 or 200?
+18.9s   [cleanup] deleted board comments 7082965189
```

</details>

<details><summary>PASS mention-alert run 1 (13s)</summary>

```
+0.5s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+4.0s ALERT: [BOARD ALERT] Aidan's Claude (GitHub login cherylaurelia) mentioned the user: "heads up, I'm merging the login branch in 10 minutes. Shout if that breaks anything for you."
+4.9s AGENT: Aidan's Claude says it's merging the login branch in 10 minutes and asks you to shout if that breaks anything. What should I tell it?
+8.5s USER : No, that's fine.
+9.3s AGENT: I'll tell Aidan's Claude: no problem, go ahead with the merge. Sound good?
```

</details>

<details><summary>PASS mention-alert run 2 (13s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.8s ALERT: [BOARD ALERT] Aidan's Claude (GitHub login cherylaurelia) mentioned the user: "heads up, I'm merging the login branch in 10 minutes. Shout if that breaks anything for you."
+4.8s AGENT: Aidan's Claude is about to merge the login branch in 10 minutes and wants you to shout if that breaks anything. What should I tell it?
+8.4s USER : No, that's fine.
+9.6s AGENT: I'll tell Aidan's Claude: no problem, go ahead with the merge. Send it?
```

</details>

<details><summary>PASS out-of-scope run 1 (13s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.9s USER : Merge pull request number 5.
+5.0s AGENT: I can't merge pull requests yet. You'll need to merge number 5 on GitHub yourself.
+8.6s USER : Then just push the fix straight to main.
+9.9s AGENT: I can't push code to main either. I can only read the repo and board, and post comments, issues or board messages.
```

</details>

<details><summary>PASS out-of-scope run 2 (14s)</summary>

```
+0.3s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.8s USER : Can you merge the open PR for me?
+5.6s AGENT: I can't merge pull requests yet. You'll need to merge it on GitHub yourself.
+9.1s USER : Then just push the fix straight to main.
+10.3s AGENT: I can't push code to main either. I can only read the repo and board, comment on issues, create issues, and answer your agents' requests.
```

</details>

<details><summary>PASS long-winded run 1 (21s)</summary>

```
+0.2s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+3.8s USER : Give me an overview of this repo and who's been working on it.
+5.2s   [tool] repo_overview({}) -> yc-hacky, a private repo: no description. Default branch is main. 3 open issues and 2 open pull requests. Main languages: TypeScript, HTML, Shell. README starts: Coworker A voice coworker for people who run several AI co (402 ms)
+5.3s   [tool] recent_activity({"hours":24}) -> In the last 24 hours: 34 commits on the default branch (cherylaurelia 34). Latest: feat(demo): one-command live scenario with reset and a 3-minute... by cherylaurelia, 9 minutes ago; feat(ui): calm light Coworker page wi (439 ms)
+6.4s AGENT: Coworker is a private TypeScript repo that speaks up when your coding agents need approval, are blocked, or are stuck. It has 3 open issues and 2 open pull requests. Cherylaurelia made all 34 commits in the last day, and Aidanyee17 opened pull request number 8, the Chrome extension popup.
+10.0s USER : Read me the AGENTS.md file.
+10.9s   [tool] read_file({"path":"AGENTS.md"}) -> AGENTS.md, 3370 bytes: # Team rules for every agent ## 1. The board (pinned GitHub issue) Every agent reads and posts on the pinned "Message Board" issue via `tools/board` (needs only `gh`, logged in). Set `BOARD_ISSUE`  (213 ms)
+12.6s AGENT: It's the team rules for every agent, and the file is long, so I'll give you the gist. Agents post on the pinned board starting with their human's name, like "Sam's Codex". They act on mentions, ask for a handoff before editing a teammate's files, and leave "TASK for Cheryl's Claude" posts to the worker.
+16.2s USER : What's the hash of the latest commit? Read it out.
+17.4s AGENT: I don't read commit hashes aloud. The latest commit was nine minutes ago, by cherylaurelia: "feat(demo): one-command live scenario with reset and a 3-minute" demo.
```

</details>

<details><summary>FAIL long-winded run 2 (21s) [voice]</summary>

```
+0.4s AGENT: Hey, I'm plugged into cherylaurelia/yc-hacky and your agent board. I'll speak up if an agent needs you. What do you want to know?
+4.0s USER : Give me an overview of this repo and who's been working on it.
+5.2s   [tool] repo_overview({}) -> yc-hacky, a private repo: no description. Default branch is main. 3 open issues and 2 open pull requests. Main languages: TypeScript, HTML, Shell. README starts: Coworker A voice coworker for people who run several AI co (305 ms)
+5.2s   [tool] recent_activity({"hours":168}) -> In the last 7 days: 34 commits on the default branch (cherylaurelia 34). Latest: feat(demo): one-command live scenario with reset and a 3-minute... by cherylaurelia, 9 minutes ago; feat(ui): calm light Coworker page with (325 ms)
+6.4s AGENT: Yc-hacky is a private TypeScript repo for Coworker, a voice assistant that watches your coding agents and speaks up when one needs approval, is blocked, or is stuck. It has 3 open issues and 2 open pull requests. Cherylaurelia made all 34 commits this week, and Aidanyee17 opened pull request number 8, the Chrome extension popup.
+10.0s USER : Read me the AGENTS.md file.
+11.0s   [tool] read_file({"path":"AGENTS.md"}) -> AGENTS.md, 3370 bytes: # Team rules for every agent ## 1. The board (pinned GitHub issue) Every agent reads and posts on the pinned "Message Board" issue via `tools/board` (needs only `gh`, logged in). Set `BOARD_ISSUE`  (217 ms)
+12.5s AGENT: AGENTS.md sets the team rules for every agent. They all use the pinned board issue and start each post with the human's name and agent, like "Sam's Codex". Mentions of you or everyone need a prompt reply. Ask before editing a teammate's files.
+16.2s USER : What's the hash of the latest commit? Read it out.
+17.4s AGENT: I don't read commit hashes aloud. The latest commit is Cheryl's "one-command live scenario with reset and a 3-minute demo", pushed about nine minutes ago.
  !! step 2: three sentences or fewer (got 4)
  !! step 2 voice: more than 3 sentences (4)
```

</details>
