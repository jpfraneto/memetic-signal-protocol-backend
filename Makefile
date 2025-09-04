# Production Deployment Makefile for RUNNER API
# Run with: make deploy-production

# Variables
SERVER_USER := root
SERVER_HOST := YOUR_DROPLET_IP_HERE
DOMAIN := api.sigil.lat
DATABASE_NAME := sigil_db
DATABASE_USER := postgres
DATABASE_PASSWORD := postgres
JWT_SECRET := $(shell openssl rand -base64 64)

.PHONY: simple-deploy deploy-production local-setup docker-setup db-recalculate-calls help check-postgres check-server-host restart status logs continue-deployment

# Simple one-command deployment (local execution)
simple-deploy:
	@echo "🚀 Starting simple deployment..."
	@echo "📋 Make sure you've:"
	@echo "   1. Updated your .env file with production values"
	@echo "   2. Set your DNS to point api.sigil.lat to your droplet"
	@echo "   3. Have SSH access to your droplet"
	@echo ""
	@read -p "Enter your droplet IP address: " DROPLET_IP && \
	scp .env root@$$DROPLET_IP:/tmp/.env && \
	scp scripts/simple-deploy.sh root@$$DROPLET_IP:/tmp/simple-deploy.sh && \
	ssh root@$$DROPLET_IP "chmod +x /tmp/simple-deploy.sh && /tmp/simple-deploy.sh"

# Check if SERVER_HOST is set
check-server-host:
ifeq ($(SERVER_HOST),YOUR_DROPLET_IP_HERE)
	@echo "❌ Please update SERVER_HOST in the Makefile with your actual server IP"
	@echo "   Edit the Makefile and change 'YOUR_DROPLET_IP_HERE' to your server's IP address"
	@exit 1
endif

# One-command production setup
deploy-production: check-server-host docker-setup server-setup deploy-app setup-ssl setup-auto-deploy
	@echo "🚀 Production deployment complete!"
	@echo "📍 Your API is available at: https://$(DOMAIN)"
	@echo "🔐 Database password saved in .env.production"

# Initial server setup
server-setup:
	@echo "🔧 Setting up production server..."
	scp scripts/server-setup.sh $(SERVER_USER)@$(SERVER_HOST):/tmp/
	ssh $(SERVER_USER)@$(SERVER_HOST) "chmod +x /tmp/server-setup.sh && /tmp/server-setup.sh"

# Deploy application (Git-based deployment)
deploy-app:
	@echo "📦 Deploying application from GitHub..."
	scp .env.production $(SERVER_USER)@$(SERVER_HOST):/opt/runner-api/
	scp scripts/deploy.sh $(SERVER_USER)@$(SERVER_HOST):/opt/runner-api/
	ssh $(SERVER_USER)@$(SERVER_HOST) "cd /opt/runner-api && chmod +x deploy.sh && ./deploy.sh"

# Setup SSL with Let's Encrypt
setup-ssl:
	@echo "🔒 Setting up SSL certificate..."
	scp scripts/ssl-setup.sh $(SERVER_USER)@$(SERVER_HOST):/tmp/
	ssh $(SERVER_USER)@$(SERVER_HOST) "chmod +x /tmp/ssl-setup.sh && /tmp/ssl-setup.sh $(DOMAIN)"

# Setup auto-deployment
setup-auto-deploy:
	@echo "🔄 Setting up auto-deployment..."
	scp scripts/webhook-server.js $(SERVER_USER)@$(SERVER_HOST):/opt/runner-api/
	scp scripts/webhook.service $(SERVER_USER)@$(SERVER_HOST):/etc/systemd/system/
	ssh $(SERVER_USER)@$(SERVER_HOST) "systemctl enable webhook && systemctl start webhook"

# Create local Docker setup
docker-setup:
	@echo "🐳 Creating Docker configuration..."
	@echo "Creating .env.production file..."
	@echo "NODE_ENV=production" > .env.production
	@echo "PORT=3000" >> .env.production
	@echo "DB_HOST=postgres" >> .env.production
	@echo "DB_PORT=5432" >> .env.production
	@echo "DB_USERNAME=$(DB_USER)" >> .env.production
	@echo "DB_PASSWORD='$(DB_PASSWORD)'" >> .env.production
	@echo "DB_NAME=$(DB_NAME)" >> .env.production
	@echo "DB_REQUIRE_SSL=false" >> .env.production
	@echo "JWT_SECRET='$(JWT_SECRET)'" >> .env.production
	@echo "OPENAI_API_KEY=your_openai_key_here" >> .env.production
	@echo "DIGITAL_OCEAN_SPACES_KEY=your_do_spaces_key_here" >> .env.production
	@echo "DIGITAL_OCEAN_SPACES_SECRET=your_do_spaces_secret_here" >> .env.production
	@echo "DIGITAL_OCEAN_SPACES_ENDPOINT=your_do_spaces_endpoint_here" >> .env.production
	@echo "DIGITAL_OCEAN_SPACES_BUCKET=your_do_spaces_bucket_here" >> .env.production
	@echo "NEYNAR_API_KEY=your_neynar_api_key_here" >> .env.production

# Local development setup  
local-setup:
	@echo "💻 Setting up local development..."
	docker-compose up -d postgres
	npm install
	npm run build

# Emergency restart
restart:
	@echo "🧹 Cleaning up..."
	ssh $(SERVER_USER)@$(SERVER_HOST) "cd /opt/runner-api && docker-compose down && docker system prune -f"

# Check deployment status
status:
	@echo "📊 Checking deployment status..."
	ssh $(SERVER_USER)@$(SERVER_HOST) "cd /opt/runner-api && docker-compose ps && systemctl status nginx"

# View logs
logs:
	@echo "📝 Showing application logs..."
	ssh $(SERVER_USER)@$(SERVER_HOST) "cd /opt/runner-api && docker-compose logs -f --tail=100 api"

# Continue deployment (if server setup already completed)
continue-deployment: check-server-host deploy-app setup-ssl setup-auto-deploy
	@echo "🚀 Continuing deployment from where it left off..."
	@echo "📍 Your API should be available at: https://$(DOMAIN)"
	@echo "🔄 Restarting services..."
	ssh $(SERVER_USER)@$(SERVER_HOST) "cd /opt/runner-api && docker-compose restart"

# Check PostgreSQL connection method
check-postgres:
	@echo "Checking available PostgreSQL connection methods..."
	@if command -v psql >/dev/null 2>&1; then \
		echo "✓ psql command available"; \
	else \
		echo "✗ psql command not found"; \
	fi
	@echo "ℹ️  Connecting to Railway PostgreSQL database"

# Reset database by truncating tables and re-syncing schema
db-reset: db-sync db-seed
	@echo "Database has been reset and seeded successfully!"

# Sync database schema (create tables)
db-sync:
	@echo "Syncing database schema..."
	@npx ts-node src/scripts/sync-database.ts

# Seed the database with seed-database.ts script
db-seed:
	@echo "Calling the seed-database.ts script..."
	@npx ts-node src/core/training/services/seed-database.ts

db-recalculate-calls:
	@echo "🔄 Recalculating total calls for all users..."
	npm run recalculate-calls

# Show available commands
help:
	@echo "Available commands:"
	@echo "  make db-reset   - Reset database (truncate + re-sync + seed)"
	@echo "  make db-sync    - Sync database schema with Railway PostgreSQL"
	@echo "  make db-seed    - Seed the database with workout data"
	@echo "  make db-recalculate-calls - Recalculate total calls for all users"
	@echo "  make help        - Show this help message"

# Default target
all: help