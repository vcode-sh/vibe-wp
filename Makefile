.DEFAULT_GOAL := help

COMPOSE := docker compose
COMPOSE_PROD := docker compose -f compose.yaml -f compose.prod.yaml
COMPOSE_EXTERNAL := docker compose -f compose.external.yaml

.PHONY: help init doctor doctor-runtime smoke build build-prod config-prod config-external up up-prod down restart ps logs tools wp wp-info wp-shell cache-enable cache-flush backup restore clean

help:
	@awk 'BEGIN {FS = ":.*##"; printf "vibe-wp commands:\n"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

init: ## Generate .env with safe local secrets
	@./bin/init-env

doctor: ## Check local prerequisites and Compose config
	@./bin/doctor

doctor-runtime: ## Check running WordPress, DB, Redis, cache, and permissions
	@./bin/doctor-runtime

smoke: ## Run end-to-end runtime smoke tests
	@./bin/smoke

build: ## Build custom WordPress, MariaDB, and Nginx images
	@$(COMPOSE) build

build-prod: ## Build using production compose override
	@$(COMPOSE_PROD) build

config-prod: ## Validate production compose config
	@$(COMPOSE_PROD) config >/dev/null
	@echo "production compose config ok"

config-external: ## Validate external-services compose config
	@$(COMPOSE_EXTERNAL) config >/dev/null
	@echo "external compose config ok"

up: ## Start the full stack
	@$(COMPOSE) up -d --build

up-prod: ## Start with production compose override
	@$(COMPOSE_PROD) up -d --build

install: ## Install WordPress and enable the Redis object cache plugin
	@./bin/install-wordpress

down: ## Stop containers
	@$(COMPOSE) down

restart: ## Restart containers
	@$(COMPOSE) restart

ps: ## Show container status
	@$(COMPOSE) ps

logs: ## Follow stack logs
	@$(COMPOSE) logs -f --tail=200

tools: ## Start optional tools such as Adminer
	@$(COMPOSE) --profile tools up -d adminer

wp: ## Run WP-CLI, for example: make wp ARGS="plugin list"
	@./bin/wp $(ARGS)

wp-info: ## Show WP-CLI runtime information
	@./bin/wp cli info

wp-shell: ## Open a shell in the WordPress runtime image
	@$(COMPOSE) run --rm --entrypoint /usr/local/bin/vibe-wp-entrypoint.sh wp sh

cache-enable: ## Enable Redis Object Cache drop-in
	@./bin/wp plugin install redis-cache --activate
	@./bin/wp redis enable

cache-flush: ## Flush WordPress object cache
	@./bin/wp cache flush

backup: ## Create a database and wp-content backup under backups/
	@./bin/backup

restore: ## Restore a backup: make restore BACKUP=backups/<timestamp> ARGS="--yes"
	@./bin/restore $(BACKUP) $(ARGS)

clean: ## Stop containers and remove stack volumes
	@$(COMPOSE) down -v --remove-orphans
