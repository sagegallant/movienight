# 🌐 Self-Hosting & Deployment Guide

MovieNight is designed to be extraordinarily versatile: it can run entirely client-side as a zero-cost static website or self-hosted on a VPS with the optional Node.js video proxy and custom TURN relays.

---

## Deployment Options at a Glance

| Deployment Mode | Infrastructure Cost | Proxy Support | Best For |
| :--- | :---: | :---: | :--- |
| **GitHub Pages** | $0 / month | ❌ (Client-Only) | Local files, YouTube sync, CORS-enabled CDN links |
| **Self-Hosted VPS (Node.js)** | $3–$5 / month | ✅ (`/proxy-video`) | Full capability: direct URLs from CORS-restricted hosts |
| **VPS + Custom TURN (Coturn)** | $5–$10 / month | ✅ (Full Relay) | Guaranteed connectivity behind restrictive corporate/campus NATs |

---

## Option 1: GitHub Pages (Zero Server Costs)

MovieNight runs cleanly as a static web application. A complete GitHub Actions deployment workflow is included in [`.github/workflows/deploy.yml`](https://github.com/sagegallant/movienight/blob/main/.github/workflows/deploy.yml):

1. **Fork or Push** this repository to GitHub.
2. Navigate to repository **Settings ➔ Pages**.
3. Under **Build and deployment ➔ Source**, select **GitHub Actions**.
4. Push a commit to the `main` branch. The action will automatically bundle assets and publish the live site to:
   ```
   https://<username>.github.io/<repo>/
   ```

*Note on Client-Only Operation*: When running on GitHub Pages, the Node.js `/proxy-video` endpoint is absent. Local video files, YouTube sync, and CORS-enabled direct video streams continue to work flawlessly.

---

## Option 2: Self-Hosted Node.js VPS (With CORS Proxy)

Hosting MovieNight on a Linux VPS (Ubuntu/Debian, Debian, Rocky Linux) allows you to enable the built-in HTTP Range CORS proxy, which enables streaming videos from third-party servers that omit CORS headers.

### 1. Prerequisites
- Node.js 18+ (Node 20 or 24 LTS recommended)
- Git
- Process manager (PM2) or systemd

### 2. Clone & Install
```bash
git clone https://github.com/sagegallant/movienight.git
cd movienight
npm install --production
```

### 3. Configure Environment Variables
Create a `.env` file or export environment variables:

```bash
# Enable the video proxy (disabled by default)
export ENABLE_VIDEO_PROXY="true"

# Specify allowed HTTPS target domains (comma-separated, wildcards supported)
export ALLOWED_PROXY_HOSTS="commondatastorage.googleapis.com,cdn.example.com,*.myvideoarchive.org"

# Ensure HTTPS enforcement
export REQUIRE_PROXY_ALLOWLIST="true"
export ALLOW_INSECURE_HTTP_PROXY="false"

# Server Port
export PORT="3000"
```

### 4. Process Management with PM2
```bash
# Install PM2 globally
npm install -g pm2

# Start MovieNight
pm2 start server.js --name "movienight"

# Configure PM2 to start on system boot
pm2 startup
pm2 save
```

### 5. Nginx Reverse Proxy Configuration (with SSL)
For production deployments, place MovieNight behind Nginx with Let's Encrypt SSL:

```nginx
server {
    listen 80;
    server_name movienight.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name movienight.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/movienight.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/movienight.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable buffering for live streaming proxy chunks
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

---

## 3. Proxy Environment Variables Reference

| Variable | Default | Description |
| :--- | :---: | :--- |
| `ENABLE_VIDEO_PROXY` | `false` | Master switch for `/proxy-video`. Returns `503 Service Unavailable` when `false`. |
| `ALLOWED_PROXY_HOSTS` | *(empty)* | Comma-separated list of allowed hostnames/wildcards (e.g. `cdn.example.com,*.myhost.net`). |
| `REQUIRE_PROXY_ALLOWLIST` | `true` | When `true`, all proxied URLs must match `ALLOWED_PROXY_HOSTS`. |
| `ALLOW_INSECURE_HTTP_PROXY` | `false` | When `false`, target URLs must use `https://`. Plain `http://` targets are rejected with `403`. |
| `PORT` | `3000` | Port for the HTTP server to listen on. |
| `ALLOWED_ORIGIN` | `null` | Origin for CORS headers (restricts to same origin by default). |

---

## 4. Option 3: Custom TURN Relay Setup (Coturn)

When participants are located behind strict symmetric NATs or corporate firewalls, direct WebRTC UDP hole punching may fail. Deploying a lightweight Coturn relay guarantees 100% connectivity.

### Installing Coturn (Ubuntu/Debian)
```bash
sudo apt update && sudo apt install -y coturn
```

### Configure `/etc/turnserver.conf`:
```ini
listening-port=3478
tls-listening-port=5349
realm=turn.yourdomain.com
fingerprint
lt-cred-mech
user=myuser:mypassword123
total-quota=100
bps-capacity=0
stale-nonce
no-loopback-peers
no-multicast-peers
```

### Start Coturn:
```bash
sudo systemctl enable coturn
sudo systemctl restart coturn
```

### Configuring MovieNight to use your TURN Server:
In the MovieNight UI:
1. Click the **Settings (⚙️)** gear on the landing page or stage.
2. In the **TURN Configuration** modal, enter your server details:
   - **TURN URL**: `turn:turn.yourdomain.com:3478`
   - **Username**: `myuser`
   - **Credential**: `mypassword123`
3. Click **Save Settings**. MovieNight stores credentials in browser `localStorage` and automatically includes them in all WebRTC ICE candidate gathers.

---

## 5. Option 4: Self-Hosted PeerJS Signaling Broker

By default, MovieNight uses the public PeerJS signaling service (`0.peerjs.com`). If you desire total signaling sovereignty:

```bash
# Install and launch peerjs server
npm install -g peer
peerjs --port 9000 --key peerjs --path /myapp
```

Then in `js/room.js`, point the `Peer` constructor to your self-hosted instance.
