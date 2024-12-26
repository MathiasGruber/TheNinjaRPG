# Define bash as default shell
SHELL := bash

.DEFAULT_GOAL = help

# Extract arguments for relevant targets.
ARGS_TARGETS=makemigrations,bun
ifneq ($(findstring $(firstword $(MAKECMDGOALS)),$(ARGS_TARGETS)),)
  ARGS := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
  $(eval $(ARGS):;@:)
endif

# Define makefile colors, see: https://gist.github.com/rsperl/d2dfe88a520968fbc1f49db0a29345b9
ifneq (,$(findstring xterm,${TERM}))
	RED          := $(shell tput -Txterm setaf 1)
	GREEN        := $(shell tput -Txterm setaf 2)
	YELLOW       := $(shell tput -Txterm setaf 3)
	RESET        := $(shell tput -Txterm sgr0)
else
	RED 		 := ""
	GREEN		 := ""
	YELLOW       := ""
	RESET        := ""
endif

include ./app/.env

## List of available commands:
---------------General------------------: # -------------------------------------------------------
.PHONY: help
help: # Print help.
	@sed -ne '/@sed/!s/## //p' $(MAKEFILE_LIST)
	@cat $(MAKEFILE_LIST) | grep -e "^[a-zA-Z_\-]*: *.*# *" | awk 'BEGIN {FS = ":.*?# "}; {printf "\033[36m%-40s\033[0m %s\n", $$1, $$2}'

.PHONY: cloc
cloc: # Count lines of code
	@echo "${YELLOW}Count lines of code${RESET}"
	cloc --exclude-dir=node_modules --exclude-ext=csv  --exclude-ext=json  --exclude-ext=svg .

-------------DockerSetup---------------: # -------------------------------------------------------
.PHONY: docker-build
docker-build: # Build/Rebuild the application.
	@echo "${YELLOW}Building/Rebuilding the application${RESET}"
	docker-compose --file $$PWD/.devcontainer/docker-compose.yml build --no-cache

.PHONY: docker-stop
docker-stop: # Stop all docker containers.
	@echo "${GREEN}docker-stop${RESET}"
	docker compose --progress plain --file $$PWD/.devcontainer/docker-compose.yml stop

-----------LocalDevelopment-------------: # -------------------------------------------------------
.PHONY: setup
setup: ## Install bun locally
	@echo "${GREEN}Installing bun locally${RESET}"
	docker compose -f .devcontainer/docker-compose.yml up -d --wait
	curl -fsSL https://bun.sh/install | bash

.PHONY: install
install: ## Install bun locally
	@echo "${GREEN}install${RESET}"
	bun install --cwd ./app

.PHONY: bun
bun: install # Execute bun commands in local development.\nExamples:\n  make bun -- run build\n  make bun -- dbpush
	@echo "${GREEN}bun${RESET}"
	docker compose -f .devcontainer/docker-compose.yml up -d --wait		
	@echo $(DATABASE_URL)
	cd app && bun $(ARGS)

.PHONY: start
start: # Run Next.js server locally outside of appcontainer for fast development.\nExamples:\n  make start
	@echo "${GREEN}start${RESET}"
	rm -rf app/.next
	@make bun -- dev --experimental-https

.PHONY: build
build: # Run Next.js server locally outside of appcontainer for fast development.\nExamples:\n  make build
	@echo "${GREEN}build${RESET}"
	cd app && bun run build

--------------Migrations----------------: # -------------------------------------------------------
.PHONY: dbpush
dbpush: # Push schema to db without creating migrations
	@echo "${YELLOW}Pushing database schema to database${RESET}"
	cd app && bun dbpush

.PHONY: seed
seed: # Seed database
	@echo "${YELLOW}Seed data into database ${RESET}"
	@echo $(DATABASE_URL)
	cd app && bun seed
	
.PHONY: makemigrations
makemigrations: # Create database migration file
	@echo "${YELLOW}Create database migrations file ${RESET}"
	cd app && bun makemigrations

.PHONY: emptymigration
emptymigration: # Create database migration file
	@echo "${YELLOW}Create empty migrations file ${RESET}"
	cd app && bun emptymigration
	
----------------Tests-------------------: # -------------------------------------------------------
.PHONY: test
test: # Push schema to db without creating migrations
	@echo "${YELLOW}Running unit tests ${RESET}"
	cd app && bun test
	