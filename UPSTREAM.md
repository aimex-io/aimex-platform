# Upstream Sync — Aimex Platform

Aimex Platform is a thin fork of [Paperclip](https://github.com/paperclipai/paperclip) (MIT). Only branding is changed.

## Diff vs upstream (closed list — do not add files outside this list)

- ui/index.html (title, apple-mobile-web-app-title)
- ui/public/site.webmanifest (name/short_name/description)
- ui/src/context/BreadcrumbContext.tsx (+ .test.tsx) (title suffix)
- ui/public/favicon.svg (placeholder — PENDING: PNG/ICO set when official logo exists)
- docker/docker-compose.yml, docker/docker-compose.quickstart.yml (service/volume/db names)
- .env.example (db creds, auth secret)
- README.md (fork banner + attribution), UPSTREAM.md (this file)

## Intentionally kept as-is

- npm scope @paperclipai/*, env vars PAPERCLIP_*, CLI bin paperclipai,
  localStorage key paperclip.theme — internal, renaming would be invasive.

## Sync procedure (about every 2 weeks)

    git fetch upstream
    git rebase upstream/master aimex/main
    # resolve conflicts (should only touch the files above), smoke-test, then:
    git push --force-with-lease origin aimex/main

Branding commits always use the `brand:` prefix.

## Sync history

- 2026-06-16: fork created from upstream.
