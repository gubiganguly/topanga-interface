# Topanga Interface — Architecture (End‑to‑End)

This document explains how the whole system works in plain English, with analogies. It covers the local OpenClaw gateway, Cloudflare Tunnel, GitHub/Vercel, and how requests flow through the code.

---

## 1) Big‑picture overview (the “mail forwarding” analogy)

Think of your **Mac mini** as a private office with a **secure receptionist** (OpenClaw Gateway) who won’t answer the phone unless the caller gives the right password (token). The office doesn’t publish its phone number to the public.

Instead, you hire **Cloudflare Tunnel** — like a **secure courier service** that creates a public forwarding address. People call the courier’s number (a public URL), and the courier safely forwards the call to your private office.

Your **website** (Topanga Interface) lives on **Vercel** (a public storefront). When a visitor sends a message, the website’s server (not the browser) talks to the receptionist through the courier, and the receptionist talks back. That’s the chat experience.

---

## 2) The components (what runs where)

### ✅ Local (Mac mini)
- **OpenClaw Gateway**
  - Listens on `127.0.0.1:18789` only (local‑only)
  - Requires a **gateway token** to accept requests
- **Cloudflare Tunnel (cloudflared)**
  - Creates `https://gateway.topangabot.com` and forwards it to `127.0.0.1:18789`
  - Keeps the gateway private while still reachable via HTTPS

### ✅ Cloud (Vercel)
- **Topanga Interface (Next.js)**
  - Public site that users visit
  - Has **API routes** that talk to the gateway

### ✅ GitHub
- Stores the project code
- **Every push to main triggers a Vercel deploy**

---

## 3) Request flow (step‑by‑step)

### A) User sends a message
1. User visits **topangabot.com** and types a message.
2. The browser calls the Next.js API route:
   - `POST /api/chat/stream`
3. That API route runs on **Vercel**, and it sends a request to:
   - `https://gateway.topangabot.com/v1/chat/completions`
4. **Cloudflare Tunnel** forwards the request to your Mac mini.
5. The **OpenClaw Gateway** receives it, checks the token, and responds.
6. The response is streamed back to the browser.

### B) Streaming replies
- The frontend reads **Server‑Sent Events** (SSE) and appends text in real time.

---

## 4) How the code is structured

### Frontend UI
File: `frontend/app/page.jsx`
- React client component
- Sends user input to `/api/chat/stream`
- Streams responses and updates the chat UI

### API routes
Files:
- `frontend/app/api/chat/route.js`
- `frontend/app/api/chat/stream/route.js`

What they do:
- Read environment variables (gateway URL + token)
- Call the gateway `/v1/chat/completions`
- If streaming: return `text/event-stream`

---

## 5) Tokens + 2‑Factor (security model)

### Gateway token (required)
- Stored on your Mac in OpenClaw config
- Stored in Vercel env vars
- Sent as:
  ```
  Authorization: Bearer <token>
  ```
- Think of it like a **bouncer wristband** for the gateway.

### Cloudflare Access (2‑factor)
- Protects **topangabot.com** with an email code
- You must log in with your email to access the site
- Acts like a **front door lock** before anyone can even see the UI

### Cloudflare Access service tokens (server‑to‑server)
- Used by Vercel when Cloudflare Access blocks the gateway
- Think of it as a **VIP pass for machines** (not humans)

---

## 6) Why the Mac mini is still private

Even though the site is public:
- The gateway binds to **localhost only**
- The only way in is **through the tunnel**
- The tunnel is protected by **Cloudflare Access + tokens**

So: the Mac mini is never directly exposed on the public internet.

---

## 7) Git + Deploy flow

1. Code lives in GitHub.
2. Vercel watches the repo.
3. Any `git push` to `main` triggers a new deployment.

This makes the deployment predictable and auditable.

---

## 8) TL;DR (one‑sentence summary)

Your **public website** (Vercel) talks to your **private assistant** (OpenClaw on your Mac) through a **secure courier** (Cloudflare Tunnel), guarded by **tokens and 2FA**, and your code is shipped via **GitHub → Vercel**.
