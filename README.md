# Shopify Pincode Tracking — Separate System

This system tracks pincode searches without modifying the existing `SandeepEdd` class.

## Architecture

Shopify theme
→ `pincode-tracker.js`
→ Node/Express `/api/track`
→ PostgreSQL
→ `/dashboard`

The tracker watches the existing `.pc-widget[data-state]` attribute using `MutationObserver`. It does not change the EDD class or its methods.

## 1. Database

Create a PostgreSQL database.

Run:

```bash
psql "$DATABASE_URL" -f schema.sql
```

## 2. Server

Install dependencies:

```bash
npm install
```

Copy `.env.example` to `.env` and set:

- `DATABASE_URL`
- `TRACKER_API_KEY`
- `ADMIN_USER`
- `ADMIN_PASSWORD`
- `ALLOWED_ORIGINS`

Start:

```bash
npm start
```

Dashboard:

```text
https://YOUR-DOMAIN.com/dashboard
```

## 3. Shopify

Upload `public/pincode-tracker.js` to Shopify as an asset.

Then add ONLY this separate script reference to the theme where your existing EDD widget is present:

```liquid
<script src="{{ 'pincode-tracker.js' | asset_url }}" defer></script>
```

Do not edit the existing EDD class.

Before uploading, change these two values in `pincode-tracker.js`:

```javascript
const TRACKING_URL = "https://YOUR-TRACKING-DOMAIN.com/api/track";
const TRACKER_KEY = "YOUR_TRACKER_API_KEY";
```

## What is tracked

- exact entered 6-digit pincode
- serviceable / unavailable / error
- express / standard
- delivery date shown by the widget
- Shopify product ID when available
- product handle
- variant ID when available
- page URL
- anonymous session ID
- timestamp
- browser user-agent

No customer name, email, phone, address, or Shopify customer ID is collected.

## Important

The tracker intentionally observes the existing widget's `data-state` changes from outside. It does not call, replace, or modify the existing EDD methods.

For production, use HTTPS and a strong random tracker key and admin password.