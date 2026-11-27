# Sprigo — Development and release

Install a new version by building your fork locally or downloading one of its published installers.

## Flow

1. **Branch:** every change is made on a branch from `master` (`feature/…`, `fix/…`, `chore/…`).
2. **Merge into test:** push the branch, open a PR against `test` and merge it. Small changes can be merged into `test` directly with `--no-ff`, without a PR. Push `test`.
   - `check` runs on every push to `test` and every PR: typecheck, tests, and `cargo check` on three operating systems (whisper.cpp included). Most errors that would break a release build are caught here.
3. **Smoke test before release:** before `test` goes to `master`, run the release build without publishing:
   ```bash
   gh workflow run release.yml --ref test
   ```
   Continue when all four builds are green (~15 min, in parallel). Packaging and signing errors show up here, before the tag.
4. **Master = live:** `test` → `master` only with explicit approval. Bump the version first (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, then `cargo update -p sprigo --offline` in `src-tauri`). `check` runs again on the push to `master`.
5. **Release:** when `check` is green on `master`, push a tag:
   ```bash
   git tag v1.3.0 && git push origin v1.3.0
   ```
   `release` runs the four builds and uploads the installers to a **draft** release.
6. **Publish:** review and publish the draft in the fork’s Releases page.
**Model guidance:** when the recommended local model or the measurements in Settings change, run `pnpm bench` → `pnpm eval` → `pnpm guide` on the release machine and commit `src/modelGuideData.ts` (provenance rules in [CONTRIBUTING.md](CONTRIBUTING.md)).

## Local macOS build

From the fork checkout, run:

```sh
pnpm install --frozen-lockfile
pnpm tauri build --debug --bundles app
```

Quit Sprigo and replace the installed app bundle with the build from
`src-tauri/target/debug/bundle/macos`. If you set `CARGO_TARGET_DIR`, look in that directory.
Use the same installed app name so your existing launcher opens the new bundle.
