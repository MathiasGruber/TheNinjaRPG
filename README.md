# :tada: TheNinja-RPG - Core 4 :tada:

This is the official source code for the game [www.TheNinja-RPG.com](www.TheNinja-RPG.com).

# :computer: Setting up locally

The codebase relies on a variety of external services for e.g. auth, websockets, database, etc. Some of these are next to impossible to replicate locally, but provide free (or very cheap) tiers. To get up and running, it is therefore required to sign up for free accounts on the following services:

- https://clerk.com/ - for auth (required)
- https://uploadthing.com/ - for file uploads (optional)
- https://replicate.com/ - for AI inference (optional)

To get started, copy `app/.env.example` to `app/.env` and fill in all variables related to services (`*CLERK*`, `REPLICATE*`, `UPLOADTHING*`).

## Option 1) VSCode DevContainer (Easiest)

The project is bootstrapped with docker within a [VScode devcontainer](https://code.visualstudio.com/docs/devcontainers/containers), making it as easy as possible to get up and running within a consistent environment. Open the project in VSCode, and then open the VScode devcontainer in the lower left corner. This should set up the entire development environment.

- Run `make dbpush` to setup database.
- Run `make seed` to seed database.
- Go to `http://localhost:3000` to view site
- Go to `http://localhost:3001` to manage database.

## Option 2) Running locally (Fastest)

WIP

# :books: Learning Guide

The following videos on youtube are recommended to get a quick introduction to the project and the components of the tech stack:

- The official TheNinja-RPG youtube, [TNR DevLog](https://www.youtube.com/watch?v=m29HidoaGqM&list=PLKGedXg3BVNJAW2nNioLEv1tcQjiwrOgA)
- Next.js, Clerk, tRPC, Planetscale, tailwind: [T3 Stack Tutorial ](https://www.youtube.com/watch?v=YkOSUVzOAA4)
- Drizzle ORM: [DrizzleORM Pitch](https://www.youtube.com/watch?v=_SLxGYzv6jo)

# :bookmark: Local Development Guide

Various `make` commands are available; type `make help` at the root directory for list of available commands. Most importantly:

- Use `make pnpm "add [package]"` if you need to add some package
- Use `make makemigrations` to create migrations file for new database changes

# :lock: Licensing

This source code is released with [no license](https://choosealicense.com/no-permission/), meaning that the work is under exclusive copyright. We do not wish for countless of online copies to be released and float around.
