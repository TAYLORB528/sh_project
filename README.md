# RIBS Simulator

A real-time survey response bias simulator with WebSocket streaming, MongoDB persistence, and Kubernetes scaling.

## What it does

- **Page 1** — Three dual-knob range sliders with a live Response Interpretation Bias Score (RIBS) calculator
- **Page 2** — Two list inputs sent to Claude (Anthropic) for AI analysis
- **Page 3** — Real-time simulator that generates fake survey responses at a user-controlled rate, streams them via WebSocket, and persists to MongoDB

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) (includes Docker Compose)
- A [MongoDB Atlas](https://www.mongodb.com/atlas) account (free tier works)
- An [Anthropic API key](https://console.anthropic.com) (optional — only needed for Page 2)

## Quick Start

**1. Clone the repo**

```bash
git clone <your-repo-url>
cd <repo-name>
```

**2. Set up your environment**

```bash
cp .env.example .env
```

Then open `.env` and fill in your MongoDB URI and Anthropic API key.

**3. Start everything with one command**

```bash
docker-compose up --build
```

That's it. Docker Compose will spin up:

- Redis (message bus)
- WebSocket server (port 3001)
- React frontend (port 5173)

**4. Open the app**

Go to [http://localhost:5173](http://localhost:5173)

## Kubernetes (optional)

To run with Kubernetes scaling:

**1. Enable Kubernetes** in Docker Desktop → Settings → Kubernetes

**2. Fill in your secrets** in `k8s.yml` (replace the placeholder values)

**3. Deploy**

```bash
docker build -t ribs-ws-server:latest .
kubectl apply -f k8s.yml
```

**4. Watch it scale**

```bash
kubectl get pods --watch
kubectl get hpa --watch
kubectl top pods --watch
```

Crank the simulator on Page 3 to trigger autoscaling.

## Architecture

```
Browser (React)
    ↕ WebSocket
WebSocket Server (Node/Express)
    ↕ Pub/Sub
Redis
    ↕
MongoDB Atlas (persistence)
```

When scaled with Kubernetes, multiple WebSocket server pods share Redis as a message bus so all connected clients receive all responses regardless of which pod they're connected to.

## Tech Stack

- React + TypeScript (Vite)
- Node.js + Express + WebSocket (ws)
- Redis (Pub/Sub)
- MongoDB Atlas
- Docker + Kubernetes
- Anthropic Claude API
