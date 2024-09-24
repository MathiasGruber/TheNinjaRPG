# Define bash as default shell
SHELL := bash

.DEFAULT_GOAL = help

# Extract arguments for relevant targets.
ARGS_TARGETS=makemigrations,pnpm
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

## List of available commands:
---------------GENERAL------------------: # -------------------------------------------------------
.PHONY: help
help: # Print help.
	@sed -ne '/@sed/!s/## //p' $(MAKEFILE_LIST)
	@cat $(MAKEFILE_LIST) | grep -e "^[a-zA-Z_\-]*: *.*# *" | awk 'BEGIN {FS = ":.*?# "}; {printf "\033[36m%-40s\033[0m %s\n", $$1, $$2}'

.PHONY: build-container
build-container: # Build/Rebuild the application.
	@echo "${YELLOW}Building/Rebuilding the application${RESET}"
	docker-compose --file $$PWD/.devcontainer/docker-compose.yml build --no-cache

.PHONY: enter
enter: # Connect to app container.
	@echo "${YELLOW}Enter into app docker container${RESET}"
	docker exec -it tnr_app bash

.PHONY: cloc
cloc: # Count lines of code
	@echo "${YELLOW}Count lines of code${RESET}"
	cloc --exclude-dir=node_modules --exclude-ext=csv  --exclude-ext=json  --exclude-ext=svg .

--------------PACKAGES----------------: # -------------------------------------------------------

.PHONY: pnpm
pnpm: # Run pnpm commands in app container
	@echo "${YELLOW}Run pnpm ${RESET}"
	docker exec -it tnr_app pnpm ${ARGS}

--------------MIGRATIONS----------------: # -------------------------------------------------------

.PHONY: seed
seed: # Seed database
	@echo "${YELLOW}Run drizzle db seed ${RESET}"
	docker exec -it tnr_app pnpm seed
	
.PHONY: makemigrations
makemigrations: # Create database migration file
	@echo "${YELLOW}Create database migrations file ${RESET}"
	docker exec -it tnr_app pnpm makemigrations

.PHONY: emptymigration
emptymigration: # Create database migration file
	@echo "${YELLOW}Create database migrations file ${RESET}"
	docker exec -it tnr_app pnpm emptymigration
	
.PHONY: dbpush
dbpush: # Push schema to db without creating migrations
	@echo "${YELLOW}Pushing database schema to development server ${RESET}"
	docker exec -it tnr_app pnpm dbpush
	
.PHONY: test
test: # Push schema to db without creating migrations
	@echo "${YELLOW}Running unit tests ${RESET}"
	docker exec -it tnr_app pnpm test
	