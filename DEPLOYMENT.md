# Simple Digital Ocean Deployment Guide

Deploy your SIGIL API to Digital Ocean with one command. This guide will get you from zero to production in minutes.

## Prerequisites

1. **Digital Ocean Droplet** (Ubuntu 22.04 or later)
2. **Domain DNS** pointing `api.sigil.app` to your droplet IP
3. **SSH Access** to your droplet as root

## Quick Start (One Command)

1. **Copy your environment file**:
   ```bash
   cp .env.production.example .env
   ```

2. **Update the `.env` file** with your actual values:
   - Database passwords
   - API keys (Neynar, OpenAI, etc.)
   - JWT secret
   - Session key

3. **Run the deployment**:
   ```bash
   make simple-deploy
   ```

That's it! The command will:
- Install Docker, Docker Compose, Nginx, and Certbot
- Clone your repository
- Set up MySQL database
- Configure SSL certificate
- Start your API at `https://api.sigil.app`

## Manual Deployment (Step by Step)

If you prefer to do it manually or need troubleshooting:

### 1. Prepare Your Droplet

```bash
# SSH into your droplet
ssh root@your-droplet-ip

# Clone the repository
git clone https://github.com/jpfraneto/sigil-backend.git /opt/runner-api
cd /opt/runner-api
```

### 2. Copy Environment File

```bash
# From your local machine
scp .env root@your-droplet-ip:/opt/sigil-api/.env
```

### 3. Run Deployment Script

```bash
# On your droplet
chmod +x scripts/simple-deploy.sh
./scripts/simple-deploy.sh
```

## Environment Variables

Required variables in your `.env` file:

```env
# Database (MySQL)
DATABASE_HOST=mysql
DATABASE_USER=sigil_user
DATABASE_PASSWORD=your-secure-password
DATABASE_NAME=sigil_db
MYSQL_ROOT_PASSWORD=your-root-password

# API Keys
NEYNAR_API_KEY=your-neynar-key
OPENAI_API_KEY=your-openai-key

# Security
JWT_SECRET=your-jwt-secret
SESSION_KEY=your-session-key

# Domain
HOST=https://api.sigil.app
SESSION_DOMAIN=api.sigil.app
```

## Useful Commands

After deployment, you can use these commands on your droplet:

```bash
cd /opt/runner-api

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Restart services
docker-compose -f docker-compose.prod.yml restart

# Update code and redeploy
git pull && docker-compose -f docker-compose.prod.yml up -d --build

# Reset database
make db-reset

# Check status
docker-compose -f docker-compose.prod.yml ps
```

## Troubleshooting

### SSL Certificate Issues
```bash
# Check certificate status
certbot certificates

# Renew certificate
certbot renew
```

### Database Issues
```bash
# Check MySQL logs
docker-compose -f docker-compose.prod.yml logs mysql

# Connect to MySQL
docker-compose -f docker-compose.prod.yml exec mysql mysql -u root -p
```

### API Issues
```bash
# Check API logs
docker-compose -f docker-compose.prod.yml logs api

# Check API health
curl https://api.sigil.app/health
```

### Nginx Issues
```bash
# Check nginx status
systemctl status nginx

# Test nginx config
nginx -t

# Restart nginx
systemctl restart nginx
```

## File Structure

The deployment creates this structure on your droplet:

```
/opt/sigil-api/
├── .env                    # Your environment variables
├── docker-compose.prod.yml # Production Docker setup
├── scripts/
│   └── simple-deploy.sh   # Main deployment script
├── src/                   # Application code
└── logs/                  # Application logs
```

## Security Notes

- The deployment automatically sets up SSL certificates
- Database passwords are only accessible within Docker network
- Firewall is configured to allow only HTTP, HTTPS, and SSH
- Application runs as non-root user inside containers

## Need Help?

If you encounter issues:
1. Check the logs: `docker-compose -f docker-compose.prod.yml logs -f`
2. Verify your `.env` file has all required variables
3. Ensure your domain DNS is pointing to the droplet IP
4. Check if ports 80 and 443 are open on your droplet