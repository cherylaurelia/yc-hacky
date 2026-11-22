#!/bin/sh
# Writes one page per talk state from index.html (the "agent speaking" state) and renders every comp.
set -e
cd "$(dirname "$0")"
for st in idle listening thinking speaking; do
  sed "s/<body data-state=\"agent\">/<body data-state=\"$st\">/" index.html > "state-$st.html"
  grep -q "data-state=\"$st\"" "state-$st.html" || { echo "state $st not written" >&2; exit 1; }
done
shot=../../.claude/skills/impeccable/scripts/impeccable
$shot shot index.html --viewport 1440x900 --out shots/main
for st in idle listening thinking speaking; do $shot shot "state-$st.html" --viewport 1440x900 --out "shots/$st"; done
if [ -f embed.html ]; then $shot shot embed.html --viewport 360x520 --out shots/embed; fi
if [ -f states.html ]; then $shot shot states.html --viewport 1440x900 --out shots/states; fi
