.DEFAULT_GOAL := help

ENV ?= local

.PHONY: help init init-prod init-stage doctor doctor-runtime smoke build build-prod build-stage config-prod config-stage config-external up up-prod up-stage down restart ps logs tools wp wp-info wp-shell cache-enable cache-flush backup restore prod-backup stage-backup stage-refresh stage-promote-files clean vibe

help:
	@awk 'BEGIN {FS = ":.*##"; printf "vibe-wp commands:\n"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

init: ## Generate .env with safe local secrets
	@./bin/init-env

init-prod: ## Generate env/prod.env with safe secrets
	@./bin/init-env --template env/prod.env.example --target env/prod.env

init-stage: ## Generate env/stage.env with safe secrets
	@./bin/init-env --template env/stage.env.example --target env/stage.env

doctor: ## Check local prerequisites and Compose config
	@VIBE_ENV=$(ENV) ./bin/doctor

doctor-runtime: ## Check running WordPress, DB, Redis, cache, and permissions
	@VIBE_ENV=$(ENV) ./bin/doctor-runtime

smoke: ## Run end-to-end runtime smoke tests
	@VIBE_ENV=$(ENV) ./bin/smoke

build: ## Build custom WordPress, MariaDB, Redis, and Nginx images
	@./bin/vibe $(ENV) compose build

build-prod: ## Build using production compose override
	@./bin/vibe prod compose build

build-stage: ## Build using staging compose override
	@./bin/vibe stage compose build

config-prod: ## Validate production compose config
	@./bin/vibe prod config

config-stage: ## Validate staging compose config
	@./bin/vibe stage config

config-external: ## Validate external-services compose config
	@./bin/vibe external config

up: ## Start the full stack
	@./bin/vibe $(ENV) up

up-prod: ## Start with production compose override
	@./bin/vibe prod up

up-stage: ## Start with staging compose override
	@./bin/vibe stage up

install: ## Install WordPress, baseline plugins, AI connectors, and cleanup defaults
	@VIBE_ENV=$(ENV) ./bin/install-wordpress

down: ## Stop containers
	@./bin/vibe $(ENV) down

restart: ## Restart containers
	@./bin/vibe $(ENV) restart

ps: ## Show container status
	@./bin/vibe $(ENV) ps

logs: ## Follow stack logs
	@./bin/vibe $(ENV) logs

tools: ## Start optional tools such as Adminer
	@./bin/vibe $(ENV) compose --profile tools up -d adminer

wp: ## Run WP-CLI, for example: make wp ARGS="plugin list"
	@VIBE_ENV=$(ENV) ./bin/wp $(ARGS)

wp-info: ## Show WP-CLI runtime information
	@VIBE_ENV=$(ENV) ./bin/wp cli info

wp-shell: ## Open a shell in the WordPress runtime image
	@./bin/vibe $(ENV) compose run --rm --entrypoint /usr/local/bin/vibe-wp-entrypoint.sh wp sh

cache-enable: ## Enable Redis Object Cache drop-in
	@VIBE_ENV=$(ENV) ./bin/wp plugin install redis-cache --activate
	@VIBE_ENV=$(ENV) ./bin/wp redis enable

cache-flush: ## Flush WordPress object cache
	@VIBE_ENV=$(ENV) ./bin/wp cache flush

backup: ## Create a database and wp-content backup under backups/
	@VIBE_ENV=$(ENV) ./bin/backup

restore: ## Restore a backup: make restore BACKUP=backups/local/<timestamp> ARGS="--yes"
	@VIBE_ENV=$(ENV) ./bin/restore $(BACKUP) $(ARGS)

prod-backup: ## Create a production backup
	@./bin/vibe prod backup

stage-backup: ## Create a staging backup
	@./bin/vibe stage backup

stage-refresh: ## Refresh staging from production: make stage-refresh ARGS="--yes"
	@./bin/vibe stage refresh-from-prod $(ARGS)

stage-promote-files: ## Promote managed plugin/theme files from staging to production
	@./bin/vibe stage promote-files-to-prod $(ARGS)

vibe: ## Run environment-aware command: make vibe ENV=stage ARGS="wp plugin list"
	@./bin/vibe $(ENV) $(ARGS)

clean: ## Stop containers and remove stack volumes
	@./bin/vibe $(ENV) down -v --remove-orphans
