# VPS First-Time Setup

Hostinger KVM1 VPS — Ubuntu 24.04, user `sam`, IP `187.124.67.117`.

## 1. Initial Server Hardening

```bash
ssh sam@187.124.67.117

# Firewall
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Verify Docker is installed
docker --version
docker compose version
```

## 2. Create Directory Structure

```bash
mkdir -p ~/apps/infra/pg-init
mkdir -p ~/apps/infra/nginx/conf.d
mkdir -p ~/apps/fincherry/backups
```

## 3. Deploy Shared Infrastructure

Copy infra files from the repo (or clone and symlink):

```bash
# Option A: clone repo first, then copy infra
cd ~/apps
git clone git@github.com:samantafluture/fincherry.git
cp -r fincherry/infra/* ~/apps/infra/

# Option B: scp from local machine
scp -r infra/* sam@187.124.67.117:~/apps/infra/
```

Create the infra `.env`:

```bash
cat > ~/apps/infra/.env << 'EOF'
POSTGRES_ADMIN_PASSWORD=<strong-random-password>
FINCHERRY_DB_PASSWORD=<strong-random-password>
EOF
chmod 600 ~/apps/infra/.env
```

## 4. DNS

Add an A record for the domain:

```
fincherry.samantafluture.com → 187.124.67.117
```

Wait for DNS propagation (check with `dig fincherry.samantafluture.com`).

## 5. Obtain Initial SSL Certificate

Before starting nginx, get the first certificate using standalone mode:

```bash
# Make sure ports 80/443 are free
sudo lsof -i :80 -i :443

docker run --rm -p 80:80 \
  -v ~/apps/infra/certbot_conf:/etc/letsencrypt \
  certbot/certbot certonly \
  --standalone \
  -d fincherry.samantafluture.com \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email
```

Note: The volume name `certbot_conf` will need to match the named volume. For the initial cert, create the named volume first:

```bash
docker volume create infra_certbot_conf

docker run --rm -p 80:80 \
  -v infra_certbot_conf:/etc/letsencrypt \
  certbot/certbot certonly \
  --standalone \
  -d fincherry.samantafluture.com \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email
```

## 6. Start Shared Infrastructure

```bash
cd ~/apps/infra
docker compose up -d
```

Verify all services are running:

```bash
docker compose ps
docker exec infra-db pg_isready -U postgres
```

Check that the fincherry database was created:

```bash
docker exec infra-db psql -U postgres -c '\l' | grep fincherry
```

## 7. Deploy FinCherry

```bash
cd ~/apps/fincherry
```

Create the production `.env`:

```bash
cp .env.production.example .env
```

Edit `.env` with real values:

```bash
nano .env
```

Required values:
- `DB_PASSWORD` — must match `FINCHERRY_DB_PASSWORD` from `infra/.env`
- `JWT_SECRET` — generate with `openssl rand -hex 32`
- `AUTH_PASSPHRASE_HASH` — generate with:
  ```bash
  docker run --rm node:20-alpine node -e "const b=require('bcryptjs');console.log(b.hashSync('your-passphrase',12))"
  ```
- `GEMINI_API_KEY` — optional, for AI features

```bash
chmod 600 .env
```

Create the external volume that nginx reads from:

```bash
docker volume create fincherry_web
```

Run the first deploy:

```bash
bash scripts/deploy.sh
```

## 8. Verify Deployment

```bash
# Health check
curl https://fincherry.samantafluture.com/api/health

# Check logs
docker logs fincherry-api --tail 50

# Check web app
curl -sI https://fincherry.samantafluture.com | head -5
```

## 9. Set Up Cron Jobs

```bash
crontab -e
```

Add these entries:

```cron
# PostgreSQL backup — daily at 2 AM UTC, keep 30 days
0 2 * * *  docker exec infra-db pg_dump -Fc -U fincherry fincherry > ~/apps/fincherry/backups/fincherry_$(date -u +\%Y\%m\%dT\%H\%M\%SZ).dump && find ~/apps/fincherry/backups -name "*.dump" -mtime +30 -delete

# Certbot renewal safety net — weekly Monday 3 AM UTC
0 3 * * 1  docker exec infra-certbot certbot renew --quiet && docker exec infra-nginx nginx -s reload
```

## 10. GitHub Actions Auto-Deploy

Add the SSH private key as a GitHub secret:

1. On the VPS, get the deploy key (or generate a new one):
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N ""
   cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys
   cat ~/.ssh/deploy_key  # copy this
   ```
2. In GitHub repo → Settings → Secrets and variables → Actions
3. Add secret `VPS_SSH_KEY` with the private key content

Now every push to `main` will trigger CI then auto-deploy.

## Troubleshooting

### API won't start
```bash
docker logs fincherry-api
# Check DATABASE_URL is correct and infra-db is reachable
docker exec fincherry-api wget -qO- http://localhost:3000/api/health
```

### Nginx 502 Bad Gateway
```bash
# Check API container is running and on infra-net
docker network inspect infra-net | grep fincherry-api
docker logs infra-nginx --tail 20
```

### Database connection refused
```bash
# Verify infra-db is healthy
docker exec infra-db pg_isready -U fincherry -d fincherry
# Check network connectivity
docker exec fincherry-api ping -c1 infra-db
```

### SSL certificate issues
```bash
docker exec infra-certbot certbot certificates
docker exec infra-nginx nginx -t
```

### Disk space (50GB VPS)
```bash
df -h
docker system df
docker image prune -a  # remove ALL unused images (not just dangling)
```
