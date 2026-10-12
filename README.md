# NS-url-Map

Developer index for the NameSilo URL migration, served by Railway at https://ns-url-map-production.up.railway.app/.

- `url-seo-file-map.html` lists every English page in the dev handoff. Each row shows the new /en URL, legacy URL(s), page ID,
  readiness (READY/THIN/BLOCKED), schema action (KEEP/ENHANCE/ADD), live status, and links to the page's folder and files
  (`page.md`, `page.json`, `schema.jsonld`) in
  [`namesiloagent/joel-namesilo-tasks`](https://github.com/namesiloagent/joel-namesilo-tasks/tree/main/dev-handoff) under `dev-handoff/`.
  That repo is private, so you need access to it for the file links to open.
- `url-seo-file-map-data.json` holds the same data as JSON.
- `url-migration-map.html` is the earlier redirect-only gallery.

## Rebuilding the map

`url-seo-file-map-data.json` and `url-seo-file-map.html` are generated. Don't edit them by hand.
Edit `templates/url-seo-file-map.template.html` or `scripts/build-map.mjs` instead.

```sh
gh repo clone namesiloagent/joel-namesilo-tasks ../joel-namesilo-tasks   # once
git -C ../joel-namesilo-tasks pull
node scripts/build-map.mjs
```

The script reads `dev-handoff/manifest.json` and lists the actual files in each `pages/<path>/` folder.

### Source settings

The handoff source is set in `map.config.json`:

```json
{ "repo": "namesiloagent/joel-namesilo-tasks", "branch": "main", "folder": "dev-handoff" }
```

Override any of them per run with `--repo`, `--branch`, or `--folder`.
The local copy defaults to `../<repo name>/<folder>`. Point it elsewhere with `--path`:

```sh
node scripts/build-map.mjs --branch some-branch --path ~/elsewhere/joel-namesilo-tasks/dev-handoff
```

The file links use the folder names as stored in the repo. GitHub paths are case-sensitive, and some manifest `folder`
values use a different case (for example `pages/support/…` when the repo has `pages/Support/…`). The script prints a note when it corrects one.

Preview locally with `python3 -m http.server`, then open http://localhost:8000/url-seo-file-map.html.
