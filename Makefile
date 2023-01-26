# Define bash as default shell
SHELL := bash

.DEFAULT_GOAL = help

# Extract arguments for relevant targets.
ARGS_TARGETS=docs,unit_test,makemigrations,makemigrations_silent,command
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

--------------MIGRATIONS----------------: # -------------------------------------------------------

.PHONY: sync
sync: # Make sure node_modules is updated in editor
	@echo "${YELLOW}Update node_modules in devcontainer${RESET}"
	cd app/tnr && yarn install