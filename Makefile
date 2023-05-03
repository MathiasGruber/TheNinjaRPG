# Define bash as default shell
SHELL := bash

.DEFAULT_GOAL = help

# Extract arguments for relevant targets.
ARGS_TARGETS=docs,prototype_migrations,makemigrations,createmigrations,yarn
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

.PHONY: build
build: # Build/Rebuild the application.
	@echo "${YELLOW}Building/Rebuilding the application${RESET}"
	docker-compose --file $$PWD/.devcontainer/docker-compose.yml build --no-cache

.PHONY: enter
enter: # Connect to app container.
	@echo "${YELLOW}Enter into app docker container${RESET}"
	docker exec -it tnr_app bash

.PHONY: initial_setup
initial_setup: # Connect to app container.
	@echo "${YELLOW}Enter into app docker container${RESET}"
	docker exec -it tnr_app yarn prisma generate
	docker exec -it tnr_app yarn prisma migrate dev
	docker exec -it tnr_app yarn prisma db seed


--------------MIGRATIONS----------------: # -------------------------------------------------------

.PHONY: sync
sync: # Make sure node_modules is updated in editor
	@echo "${YELLOW}Update node_modules in devcontainer${RESET}"
	cd app/tnr && yarn install

.PHONY: prototype_migrations
prototype_migrations: # Prototype migrations locally
	@echo "${YELLOW}Run prisma db push ${RESET}"
	docker exec -it tnr_app yarn prisma db push

.PHONY: createmigrations
makemigrations: # Create local migrations
	@echo "${YELLOW}Run prisma migrate dev ${RESET}"
	docker exec -it tnr_app yarn prisma migrate dev --name ${ARGS} --create-only
	docker restart tnr_app
	cd app/tnr && yarn install

.PHONY: makemigrations
makemigrations: # Create & apply local migrations
	@echo "${YELLOW}Run prisma migrate dev ${RESET}"
	docker exec -it tnr_app yarn prisma migrate dev --name ${ARGS}
	docker restart tnr_app
	cd app/tnr && yarn install

.PHONY: yarn
yarn: # Run yarn command in app container
	@echo "${YELLOW}Run yarn ${RESET}"
	docker exec -it tnr_app yarn ${ARGS}
	docker restart tnr_app
	cd app/tnr && yarn install

.PHONY: seed
seed: # Seed database
	@echo "${YELLOW}Run prisma db seed ${RESET}"
	docker exec -it tnr_app yarn prisma db seed
	