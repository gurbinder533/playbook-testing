---
name: app-project-tracker-5x2d3w1q
description: "A live portfolio dashboard bound to your room's project data and always\
  \ current. Ships the finished bundle (app.yaml, pages/home.js, styles.css) \u2014\
  \ bind it to the room's data by editing those files in place; never regenerate the\
  \ design. Use when someone asks for a project tracker, portfolio/status dashboard,\
  \ milestone tracker, or program-management report."
---

AI Project Tracker App

A finished, hand-designed app bundle. **Edit these files in place** — never add,
rename, or regenerate one:

- `app.yaml` — point the `data` source at the room's real feature view
- `pages/home.js` — reconcile only the SQL column names to the room's schema
- `styles.css` — leave alone; the finished design is the whole value

The SQL reads `project`, `owner`, `status`, `progress`, `start_date`, `due_date`,
`milestone`, `tasks_total`, `tasks_done`, `team`.

The gallery form picks the source tool (Jira / Asana / Linear / Monday.com / ClickUp)
and pre-flights only that connector.

Full rules for binding and publishing: the **`live-app-builder`** skill.
