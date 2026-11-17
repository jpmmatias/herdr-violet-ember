# Ember for Herdr

Ember lives inside Herdr's `ember-companion` layout. She follows agent metadata through Herdr's native API and uses the `violet-ember` theme.

## Open Ember

With Herdr running, select the `ember-companion` layout in Settings, or run:

```sh
herdr-app do layout.switch '{"name":"ember-companion"}'
```

Switch to another layout to hide Ember.

## Set up Ember

The first-run setup lets you choose English or Portuguese, select the illustrated or animated character, and preview a sample alert. Existing preferences remain selected. Finish or skip to close setup; it appears only once unless you reopen it from Settings.

The sample is labeled as a preview. It does not describe a real agent, create a history entry, or offer a live agent action.

## Follow the work

Use **What's happening?** to see the current agent counts and tasks. Click a live agent to focus it. The summary works in Quiet mode.

The sidebar's **Tasks** tab uses the same task labels as Ember. The **Agents** tab retains Herdr's original list, including its pinning and nested-agent controls. Task labels use meaningful reported titles or tab names, with a program/address fallback. Ember does not read terminal conversations or infer whether tests passed.

Open **History** to review timestamped activity after bubbles disappear. History records observed status and working-title changes, even when automatic bubbles are muted. Its timestamps mean when Ember observed an update. Closed agents remain readable but cannot be focused. The journal retains the latest 60 entries across layout reloads.

## Choose interruptions

Settings let you follow all spaces or only the current space. The choice applies to summaries, history, task rows, and automatic comments. With no current space, the current-space view is empty.

Work updates and completion alerts have separate controls. Quiet mode suppresses work commentary. Blocked alerts keep priority. Turning a notification category back on does not replay muted updates. Work commentary is limited to one bubble per minute.

Snooze pauses automatic agent alerts for 30 minutes. It shows the remaining time and can end early. The deadline survives a layout reload, and expiry leaves your Quiet and category settings unchanged. History and the attention count continue to update. Muted events do not replay afterward. A focus timer you started still announces its completion.

Agent alerts name the program, workspace, and reported task. A blocked state means the agent needs attention; Ember does not assume it needs approval. Greetings, reactions, and review prompts rotate through a small English or Portuguese phrase set.

Click a bubble once to reveal it, then again to dismiss it. **View agent** targets a live agent. **Zzz** puts Ember to sleep until **Wake** is clicked. Drag the floating block to reposition her within Herdr.

Use compact mode to keep only a small portrait nearby. Its badge counts blocked and completed agents in your selected scope, including while alerts are snoozed. Click the portrait to expand it. If agents need attention, it opens the current summary. Compact mode keeps recording history without opening speech bubbles.

## Choose the character

The illustrated character remains the default. Select the animated vector character for blinking, thinking, concerned, celebrating, and sleeping expressions. Motion off keeps the character still and shows bubble text immediately.

The vector frames are native SVG assets. They are not the Haru Live2D model. Herdr's mod API does not host the previous browser-based Live2D renderer.

The existing encouragement, coffee, language, size, and 25-minute focus timer controls remain available. Preferences persist. The focus timer resets when the layout closes.

## Local state

The companion stores preferences and its bounded activity journal separately in Herdr shared state. Only the floating companion records events. The task-list view reads live agents without a second journal writer. This mod runs no external programs, makes no network requests, and writes no desktop status file.

## Verify changes

From the Herdr configuration folder:

```sh
node tests/ember-companion.cjs
node tests/ember-animation.cjs
node tests/ember-layout.cjs
herdr-app check mods/ember-companion
herdr-app check mods/ember-agent-tabs
```

Regenerate the vector frames with:

```sh
python3 tools/generate-ember-animation.py
```

Run these from the repository root or the Herdr configuration folder. The tests need Herdr's `gpui-kit.d.ts`. They look for it in the current folder, then in `$HERDR_APP_HOME` or `~/.config/herdr-app`, or at the path in `GPUI_KIT_TYPES`. Native checks require a graphical session. See [COMPANION.md](../../COMPANION.md#verification) for the latest verification record.
