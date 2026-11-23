// A code-level check that the user, not text the model read (a board post, an issue, a README), asked for a risky
// action: their own last words, said within the last minute, must be a clear yes.
export type Said = { text: string; at: number };

const MAX_AGE_MS = 60_000;
const NO = /\b(no|nope|don'?t|do not|cancel|wait|never|not|stop)\b/i;
const YES = /\b(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|confirm(?:ed)?|please|go for it|sounds good|correct|approve[ds]?|merge it|close it|start it)\b/i;

export const confirmed = (last: Said | undefined, now = Date.now()) =>
  !!last && now - last.at <= MAX_AGE_MS && !NO.test(last.text) && YES.test(last.text);
