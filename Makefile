.DEFAULT_GOAL := help

COMPOSE := docker compose

.PHONY: help init doctor build up down restart ps logs tools wp wp-info wp-shell cache-enable cache-flush backup clean

help:
	@awk 'BEGIN {FS = ":.*##"; printf "vibe-wp commands:\n"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

init: ## Generate .env with safe local secrets
	@./bin/init-env

doctor: ## Check local prerequisites and Compose config
	@./bin/doctor

build: ## Build custom WordPress and Nginx images
	@$(COMPOSE) build

up: ## Start the full stack
	@$(COMPOSE) up -d --build

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

clean: ## Stop containers and remove stack volumes
	@$(COMPOSE) down -v --remove-orphans
