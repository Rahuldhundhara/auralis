# QA evidence

This folder contains the curated Windows verification evidence.

- `upgrade-results.json`, `upgrade-splash.png` and `upgrade-settings.png` are the focused 1.1.0 upgrade pass: cold-start animation, hidden scrollbars, mini-player seeking, Queue-first Now Playing, lyrics switching, quality reload, Media Session, Jump Back In, search-history removal, EQ/bass boost and translation setup errors.
- `full/results.json` is the machine-readable result of the 21-check live pass re-run on 1.1.0.
- `full/*.png` are the screenshots from that pass.
- `packaged-*.png` show the packaged installer and portable builds.
- `brand-*.png`, `logo-preview.png` and `*-icon.png` are the final logo and Windows icon checks.

The full test plan, results and reproduction commands are in [`../docs/QA.md`](../docs/QA.md).
