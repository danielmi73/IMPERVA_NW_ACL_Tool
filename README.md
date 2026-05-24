# 🛡️ IMPERVA_NW_ACL_Tool

> **Imperva DDoS ACL Automation Tool** — A full-stack platform for real-time DDoS attack monitoring, automated ACL-based blocking, and email notification delivery via the Imperva Network Security API.

---

## 📋 Overview

This tool integrates with the **Imperva NetSec API** to continuously poll for DDoS attack events and automatically apply or remove ACL (Access Control List) blocking policies on affected IP prefixes. It provides a clean web dashboard for managing customers, IP prefixes, policies, viewing attack history, and sending email notifications — all in real time.

### Key Capabilities

- 🔴 **Real-time attack detection** — polls Imperva every 60 seconds for `DDOS_START_IP_RANGE` / `DDOS_STOP_IP_RANGE` events
- 🚫 **Automatic ACL blocking** — applies NetSec v2 ACL policies to attacked prefixes when an attack starts
- ✅ **Automatic unblocking** — removes ACL policies when the attack stops
- 📊 **Attack history** — stores all events with detected/resolved timestamps and peak traffic (Mbps)
- 👥 **Customer management** — assign IP prefixes to customers for organized tracking
- 📧 **Email notifications** — full SMTP support with customizable per-customer templates and mandatory template variables
- 🌐 **Timezone-aware UI** — all timestamps displayed in the client's local timezone

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Docker Container                   │
│                                                     │
│  ┌──────────┐    ┌──────────────┐    ┌───────────┐  │
│  │  Nginx   │───▶│  FastAPI     │───▶│  SQLite   │  │
│  │ (port 80)│    │  Backend     │    │  Database │  │
│  │          │    │  + Scheduler │    │           │  │
│  └──────────┘    └──────┬───────┘    └───────────┘  │
│       │                 │                           │
│  ┌────▼─────┐           │                           │
│  │  React   │           ▼                           │
│  │  Frontend│    ┌──────────────┐                   │
│  │  (Vite)  │    │ Imperva API  │                   │
│  └──────────┘    │ (my.imperva  │                   │
│                  │  .com)       │                   │
│                  └──────────────┘                   │
└─────────────────────────────────────────────────────┘
```

**Tech Stack:**

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, APScheduler, aiosmtplib |
| Database | SQLite + SQLAlchemy + Alembic |
| Frontend | React 18, TypeScript, Vite |
| Reverse Proxy | Nginx (SSL termination) |
| Deployment | Docker (single container) |
| API | Imperva NetSec v2 + Infra Events API |

---

## 🚀 Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- An **Imperva** account with:
  - API ID and API Key
  - Account ID
  - At least one ACL policy configured in NetSec
- (Optional) An SMTP server for email notifications

### 1. Clone the repository

```bash
git clone https://github.com/danielmi73/IMPERVA_NW_ACL_Tool.git
cd IMPERVA_NW_ACL_Tool
```

### 2. Start the container

```bash
docker-compose up -d --build
```

The app will be available at **https://localhost** (self-signed certificate on first run).

### 3. First-time setup

1. Open **https://localhost** in your browser
2. You'll be prompted to **set an admin password** — this is stored securely (bcrypt hashed)
3. Navigate to **Admin** → enter your Imperva credentials:
   - API ID
   - API Key
   - Account ID
4. Click **Test Connection** to verify
5. Click **Sync Prefixes** to import your protected IP ranges from Imperva
6. Configure ACL policies and assign them to prefixes as needed
7. (Optional) Configure **Email Notifications** in the Admin page

---

## ⚙️ Configuration

### Environment Variables (`docker-compose.yml`)

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | `change-me-in-production` | JWT signing key — **change this!** |
| `IMPERVA_DEBUG` | `false` | Set to `true` to log full API request/response bodies |

### Debug Mode

To enable verbose API logging:

```bash
IMPERVA_DEBUG=true docker-compose up -d --force-recreate
```

Then tail the logs:

```bash
docker logs -f ddos-manager | grep "IMPERVA DEBUG"
```

---

## 📱 Pages & Features

### Dashboard
- Live table of all IP prefixes with attack status
- Color-coded attack indicators (🔴 Under Attack / ✅ Clean)
- Customer assignment, ACL policy, action (Block/Pass), thresholds
- Click any CIDR to open the Prefix detail page

### Prefix Detail (`/prefixes/:id`)
- Stats: total attacks, currently active, peak traffic (Mbps)
- Inline-editable settings: action, ACL policy, thresholds, notify
- Full attack history table with detected/resolved timestamps

### Customers (`/customers`)
- Create and manage customer accounts
- View prefix count and active attack count per customer

### Customer Detail (`/customers/:id`)
- List of assigned prefixes with inline settings
- Full attack history grouped by prefix
- **Custom Message** editor with template variable chips and live preview

### Admin (`/admin`)
- API credentials management (encrypted at rest)
- ACL policy sync and description editor
- Connection test
- Poll interval configuration
- Change admin password
- **Email Notifications** — SMTP server configuration and global email template editor

---

## 📧 Email Notifications (Phase 2)

Attack notifications are sent automatically when a prefix's **Notify Customer** toggle is enabled and the customer has an email address configured.

### SMTP Configuration

Set up the SMTP server in **Admin → Email Notifications**:

| Field | Description |
|---|---|
| SMTP Host | e.g. `smtp.gmail.com` |
| Port | Auto-filled based on encryption mode |
| Encryption | `STARTTLS` (587), `SSL/TLS` (465), or `None` (25) |
| Username | SMTP login username |
| Password | Encrypted at rest — only re-sent when changed |
| Sender Email | The `From:` address for all outgoing notifications |

After saving, use **Send Test Email** to verify the configuration — a test message is sent to the configured sender address with sample attack data.

### Email Template Variables

The default subject and body template (configurable in Admin) and each customer's Custom Message support the following mandatory variables:

| Variable | Description | Example |
|---|---|---|
| `{{event_type}}` | Event kind | `Attack Started` / `Attack Stopped` |
| `{{prefix}}` | Attacked IP prefix / CIDR | `203.0.113.0/24` |
| `{{acl_name}}` | Assigned ACL policy name | `Block All Traffic` |
| `{{acl_id}}` | Imperva ACL policy ID | `12345` |
| `{{customer_name}}` | Customer display name | `Acme Corp` |
| `{{detected_at}}` | Detection datetime (UTC) | `2026-05-24 21:00 UTC` |
| `{{peak_mbps}}` | Peak attack bandwidth in Mbps | `4820.5` |
| `{{threshold_mbps}}` | Configured threshold (blank if not set) | `1000.0` |

### Default Email Template

```
Subject: [DDoS Alert] {{event_type}} — {{prefix}}

Dear {{customer_name}},

This is an automated notification from the DDoS Management System.

Event:      {{event_type}}
Prefix:     {{prefix}}
ACL:        {{acl_name}} (ID: {{acl_id}})
Detected:   {{detected_at}}
Peak:       {{peak_mbps}} Mbps
Threshold:  {{threshold_mbps}} Mbps

{{custom_message}}

—
Imperva DDoS Management
```

The `{{custom_message}}` slot is replaced by each customer's individual Custom Message. If no custom message is set, the placeholder is removed cleanly.

### Per-Customer Custom Message

On the **Customer Detail** page, the **Custom Message** field supports the same template variables. The message is appended inside the global template at the `{{custom_message}}` position. A live preview (with sample values substituted) is shown below the editor as you type.

---

## 🔌 Imperva API Integration

The tool uses two Imperva API endpoints:

| Purpose | Endpoint |
|---|---|
| Poll DDoS events | `POST https://my.imperva.com/api/v1/infra/events` |
| List protected IPs | `GET https://api.imperva.com/netsec-settings/netsec/v2/accounts/{id}/policies` |
| Get ACL assets | `GET https://api.imperva.com/netsec-settings/netsec/v2/policies/{id}/assets` |
| Update ACL assets | `PUT https://api.imperva.com/netsec-settings/netsec/v2/policies/{id}/assets?body={...}` |

### Event Polling Logic

1. Every 60 seconds, fetch events from the **last 10 minutes** (to handle Imperva's eventual consistency delay)
2. De-duplicate events using `eventId` — already-processed events are skipped
3. On `DDOS_START_IP_RANGE`:
   - Mark prefix as `is_under_attack = True`
   - If action is `block` and ACL policy is configured → apply ACL via PUT
   - Record event with `eventTime` from Imperva as `detected_at`
   - Send email notification if `notify_customer` is enabled and customer has an email
4. On `DDOS_STOP_IP_RANGE`:
   - Mark prefix as `is_under_attack = False`
   - Remove ACL (if it was applied)
   - Resolve the open attack event using `eventTime` from Imperva as `resolved_at`
   - Update `peak_mbps` from `bwBlocked` field
   - Send email notification if `notify_customer` is enabled and customer has an email

---

## 📁 Project Structure

```
├── backend/
│   ├── app/
│   │   ├── api/routes/          # FastAPI route handlers
│   │   │   ├── admin.py         # Credentials, ACL, SMTP, settings
│   │   │   ├── auth.py          # Login, setup, password change
│   │   │   ├── customers.py     # Customer CRUD
│   │   │   └── prefixes.py      # Prefix management + attack history
│   │   ├── core/
│   │   │   ├── config.py        # App settings
│   │   │   ├── scheduler.py     # APScheduler setup
│   │   │   └── security.py      # JWT + encryption helpers
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── services/
│   │   │   ├── imperva.py       # Imperva API client
│   │   │   ├── attack_monitor.py # Poll loop + ACL automation + notification triggers
│   │   │   └── notifier.py      # SMTP email notification service (aiosmtplib)
│   │   └── main.py              # FastAPI app entry point
│   ├── alembic/                 # Database migrations
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/               # React page components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Prefix.tsx
│   │   │   ├── Customer.tsx     # Upgraded: template variable editor + preview
│   │   │   ├── Customers.tsx
│   │   │   ├── Admin.tsx        # Upgraded: Email Notifications card
│   │   │   └── Login.tsx
│   │   ├── components/
│   │   │   └── TemplateVariableHelper.tsx  # Reusable {{var}} chip inserter
│   │   ├── services/api.ts      # Axios API client
│   │   ├── utils/date.ts        # Timezone-aware date formatting
│   │   └── index.css            # Global styles (dark theme)
│   └── package.json
├── nginx/nginx.conf             # Reverse proxy config
├── scripts/
│   ├── entrypoint.sh            # Container startup script
│   └── generate_certs.sh        # Self-signed SSL cert generator
├── Dockerfile                   # Multi-stage build
├── docker-compose.yml
└── README.md
```

---

## 🔒 Security Notes

- Admin password is stored as a **bcrypt hash** — never in plain text
- Imperva API credentials are **AES-encrypted** at rest in the database
- SMTP password is **AES-encrypted** at rest — never echoed back to the frontend
- JWT tokens expire after 8 hours
- **Change `SECRET_KEY`** in `docker-compose.yml` before any production deployment
- The self-signed SSL certificate is auto-generated on first run; replace with a valid cert for production

---

## 🛠️ Development

### Rebuilding after code changes

```bash
docker-compose up -d --build --force-recreate
```

### View logs

```bash
docker logs -f ddos-manager
```

### Access the database

```bash
docker exec -it ddos-manager bash -c "cd /app/backend && python -c \"
import app.db.base
from app.db.session import SessionLocal
from app.models.prefix import Prefix
db = SessionLocal()
for p in db.query(Prefix).all():
    print(p.cidr, p.is_under_attack)
\""
```

### Manual event backfill

```bash
docker exec ddos-manager bash -c "cd /app/backend && python -c \"
import asyncio, app.db.base
from app.db.session import SessionLocal
from app.services.attack_monitor import _get_client_from_db, _handle_attack_start, _handle_attack_stop
from datetime import datetime, timedelta, timezone

async def backfill():
    db = SessionLocal()
    client = _get_client_from_db(db)
    now = datetime.now(timezone.utc)
    events = await client.get_infra_events(from_dt=now - timedelta(hours=24), to_dt=now)
    print(f'Found {len(events)} events')
    events.sort(key=lambda x: x.get('eventTime', ''))
    for e in events:
        t = e.get('eventType', '')
        cidr = e.get('eventTarget', '')
        eid = str(e.get('eventId', ''))
        if t == 'DDOS_START_IP_RANGE': await _handle_attack_start(db, client, e, eid, cidr)
        elif t == 'DDOS_STOP_IP_RANGE': await _handle_attack_stop(db, client, e, eid, cidr)
    print('Done')

asyncio.run(backfill())
\""
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 👤 Author

**Daniel Milshtein** — [@danielmi73](https://github.com/danielmi73)
