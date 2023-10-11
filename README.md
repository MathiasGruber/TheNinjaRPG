# :tada: TheNinja-RPG - Core 4 :tada:

This is the official source code for the game [www.TheNinja-RPG.com](www.TheNinja-RPG.com).

# :computer: Setting up locally

The codebase relies on a variety of external services for e.g. auth, websockets, database, etc - all of these have free tiers more than capable of sustaining local development. To get up and running, it is therefore required to sign up for free accounts on the following services:

- https://clerk.com/ - for auth
- https://planetscale.com/ - for database
- https://pusher.com/ - for websockets
- https://upstash.com/ - for redis

The following videos on youtube are recommended to get up to speed with different components of the stack:

- Next.js, Clerk, tRPC, Planetscale, tailwind: [T3 Stack Tutorial ](https://www.youtube.com/watch?v=YkOSUVzOAA4)
- Drizzle ORM: [DrizzleORM Pitch](https://www.youtube.com/watch?v=_SLxGYzv6jo)
- Upstash: [Rate-Limit with UpStash](https://www.youtube.com/watch?v=yfGCmSjGIxk)

Using information from these services, copy `app/.env.example` to `app/.env` and fill in all variables related to these services (`*CLERK*`, `DATABASE_URL`, `UPSTASH*`, and `*PUSHER*`). The project is bootstrapped using [VScode devcontainer](https://code.visualstudio.com/docs/devcontainers/containers) and docker, making it as easy as possible to get up and running. The recommended way of spinning up locally, therefore, is to open the project in VSCode, and then open the VScode devcontainer in the lower left corner. This should set up the entire development environment.

- Run `make dbpush` to setup database.
- Run `make seed` to seed database.
- Go to `http://localhost:3000` to view.

# :bookmark: Local Development Guide

Various `make` commands are available; type `make help` at the root directory for list of available commands. Most importantly:

- Use `make pnpm "add [package]"` if you need to add some package
- Use `make dbpush` to push schema changes to database witout creating migration file
- Use `make makemigrations` to create migrations file for new database changes

# :lock: Licensing

This source code is released with [no license](https://choosealicense.com/no-permission/), meaning that the work is under exclusive copyright. We do not wish for countless of online copies to be released and float around.
