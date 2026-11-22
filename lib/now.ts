// Spoken-friendly local time passed to the agent as the {{now}} dynamic variable.
export const localNow = () =>
  new Date().toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
