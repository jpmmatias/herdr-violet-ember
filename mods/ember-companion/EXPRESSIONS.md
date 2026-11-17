# Expressions and behavior

Built-in image_gen edits of `ember-chibi.png`, saved beside it as `ember-happy.png`, `ember-thinking.png`, and `ember-worried.png`. Idle retains the original image. Working uses thinking, blocked uses worried, and done uses happy. Interactions temporarily override the expression.

- happy: Edit this Ember chibi. Change ONLY facial expression to joyful celebration, eyes closed in happy arcs, broad delighted smiling mouth. Preserve exact character, pose, full body, clothing, colors, framing, proportions and transparent background. One character only, no text, no symbols, no scene.
- thinking: Edit this Ember chibi. Change ONLY facial expression to thoughtful concentrated expression, slightly furrowed eyebrows, eyes looking sideways, small thoughtful mouth. Preserve exact character, pose, full body, clothing, colors, framing, proportions and transparent background. One character only, no text, no symbols, no scene.
- worried: Edit this Ember chibi. Change ONLY facial expression to gently concerned expression, raised inner eyebrows and small worried mouth, caring rather than distressed. Preserve exact character, pose, full body, clothing, colors, framing, proportions and transparent background. One character only, no text, no symbols, no scene.

Preferences use Herdr shared state under `ember.preferences.v1`: language, motion, quiet mode, avatar size, completed focus sessions. Timer progress and sleep state are temporary. Quiet mode suppresses greetings and work-start chatter; blocked/done alerts and requested interactions remain available.

Agent transitions are sampled once per second. Blocked alerts take precedence, other relevant alerts wait, and unchanged statuses do not repeat. A persistent action button opens an available blocked/done agent even after its bubble expires. The text reveal runs at 30 milliseconds per character; a click reveals everything, a second dismisses it. Reduced motion shows complete text immediately.

Checks: `node tests/ember-companion.cjs` exercises behavior and GPUI method compatibility. This is not a native rendering check. See [COMPANION.md](../../COMPANION.md#verification) for native check results.
