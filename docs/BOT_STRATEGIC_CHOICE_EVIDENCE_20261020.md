# Strong BOT: strategic choice opportunity audit (2026-10-20)

## Why this is first

Before modifying hard BOT policy, establish that it often encounters genuinely
spendable choices when castle/fort pressure or an affordable heavy creates a
meaningful fork. Previous variants frequently changed logic without changing
full-match outcomes; see BOT_RESEARCH_SYNTHESIS_20261020.md and the rejected
PR #12 holdout.

## Test-only implementation

- The two strategic-choice test files inject a read-only observer into the
  localhost QA game source **in memory**. The committed online-game.js,
  online-ipad.html, online-embed.html, main, and Firebase remain untouched.
- On entry to actual botExpertAction, record this team's cards in hand plus
  unlimited infantry. Check cost, charges, actual placement legality, and
  unit cap. Spell availability is not assumed to have tactical value.
- Label spendable cards by broad roles: capture, defense, siege, spell. These
  are descriptive proxies, **not** superiority labels.
- Flag a meaningful strategic fork if >=2 roles are available AND a fort
  is threatened, either castle is under direct pressure, or a heavy card
  is currently affordable. Record the actual play or wait on function return.
- Only the team's own legal hand/resources and the public visible enemy
  are read. No opponent's true resource or hidden hand is used.
- Audit **24 paired full-match scenarios** on known seeds 17/41, both sides,
  diverse scripted styles and self-play with terrain mirrors. Each pair is
  the same BOT with or without a read-only observer. Winner, timing, hand,
  card usage, fort occupancy time, both castle HP and QA counters must
  agree or the test fails.
- Save per-scenario and summary JSON; print aggregate results in GitHub
  Actions logs. Repeated decisions are correlated within the same match;
  the counts are not independent sample sizes. All seeds are research
  material and **cannot be reused as untouched holdout**.

## Interpretation and gates

Passing the workflow establishes observational integrity and a distribution
of different legal choices, **not** improved strength. A "legal" spell or
different card role need not be a useful strategic alternative.

The next BOT behavior patch should select a frequent, actionable failure
mode shown by this audit or consented human match data. Keep the unchanged
hard BOT as baseline; first compare paired training games, then preregister
unused holdout seeds and multiple opponent styles and teams. Failures must
not be relabeled a victory by retuning the same holdout.
