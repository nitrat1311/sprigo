# Romanian course and voice handoff

Use this note when continuing the Romanian course, including B1. The current
Romanian course in `courses/ro.yml` is A1; B1 has not yet been authored. Follow
the existing course schema and contribution guide, keep lesson titles and
descriptions in English, and use Romanian diacritics in the learning content.

## Local voice preference

- The learner compared Piper samples and chose **Raluca high**. The local
  Romanian Piper mapping uses `ro_RO-raluca-high` for both character genders.
- The voice is downloaded from the `eduardem/piper-tts-romanian` model
  repository and cached locally by Piper. Model files are not part of Git.
  Model card: https://huggingface.co/eduardem/piper-tts-romanian
- The model card identifies the license as CC BY-NC 4.0. Review its terms and
  suitability for Sprigo before proposing or distributing it upstream. The
  current Raluca choice is a local preference, not approval for commercial use.
- Sprigo's current Kokoro integration does not support Romanian. Do not use it
  as a benchmark for Romanian pronunciation.
- The settings preview now uses a Romanian test sentence for Romanian courses.

## Checks for later work

- Listen to new B1 vocabulary and natural sentences, including questions,
  diacritics, numbers and longer sentences; verify pronunciation and intonation.
- The learner reported that the beginning of speech can be cut off. Its cause
  has not been established or fixed; test playback in the app, including the
  first line after opening it and subsequent lines.
- When adding a level or changing lesson prompts, follow `CONTRIBUTING.md`:
  validate the course and run the relevant build, tests, e2e and lesson evals.

## Branch and PR context

The Romanian A1 contribution is PR https://github.com/ozerozdas/sprigo/pull/133,
targeting `test`. The local `fix/romanian-review` branch contains follow-up
work; changes on that branch are not automatically reflected in PR #133. Check
the current branch, working tree, PR review and model license before preparing
any upstream update. Do not assume local model caches exist on another machine.
PR #133 has changes requested: rebase on `test`, address Romanian language
detection in `src/evalRules.ts`, finish the requested language registrations and
course corrections, and check the review for its complete current details.
