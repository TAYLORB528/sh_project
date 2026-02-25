import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import { WebSocketServer, WebSocket } from "ws";
import { MongoClient, Collection } from "mongodb";
import { createClient } from "redis";
import http from "http";

dotenv.config();

/* ───────────── Types ───────────── */

interface Range {
  min: number;
  max: number;
}

interface SimulatedResponse {
  userId: string;
  timestamp: Date;
  ranges: Range[];
  ribs: number;
  ctb: number;
  ab: number;
  erb: number;
}

/* ───────────── RIBS Calculator ───────────── */

function calculateRIBS(ranges: Range[]) {
  const midpoints = ranges.map((r) => (r.min + r.max) / 2);
  const spreads = ranges.map((r) => r.max - r.min);
  const avgMidpoint = midpoints.reduce((a, b) => a + b, 0) / midpoints.length;
  const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  const ctb = 1 - Math.abs(avgMidpoint - 5.5) / 4.5;
  const ab = (avgMidpoint - 5.5) / 4.5;
  const erb = avgSpread / 9;
  const ribs = ctb * 0.4 + (1 - Math.abs(ab)) * 0.3 + (1 - erb) * 0.3;
  return { ribs, ctb, ab, erb };
}

/* ───────────── Simulator ───────────── */

function generateRandomRange(): Range {
  const min = Math.floor(Math.random() * 9) + 1;
  const max = Math.floor(Math.random() * (10 - min)) + min + 1;
  return { min: Math.min(min, 10), max: Math.min(max, 10) };
}

function generateResponse(): SimulatedResponse {
  const ranges = [
    generateRandomRange(),
    generateRandomRange(),
    generateRandomRange(),
  ];
  const { ribs, ctb, ab, erb } = calculateRIBS(ranges);
  return {
    userId: `user_${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date(),
    ranges,
    ribs: Math.round(ribs * 1000) / 1000,
    ctb: Math.round(ctb * 1000) / 1000,
    ab: Math.round(ab * 1000) / 1000,
    erb: Math.round(erb * 1000) / 1000,
  };
}

/* ───────────── Redis ───────────── */

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const CHANNEL = "ribs:responses";
const RATE_CHANNEL = "ribs:rate";

// Publisher client — used by simulator to publish responses
const publisher = createClient({ url: REDIS_URL });

// Subscriber client — used by this pod to receive responses and broadcast to WS clients
const subscriber = createClient({ url: REDIS_URL });

// General client — used for rate control commands and history queries
const redisClient = createClient({ url: REDIS_URL });

async function connectRedis() {
  await Promise.all([
    publisher.connect(),
    subscriber.connect(),
    redisClient.connect(),
  ]);
  console.log("✅ Connected to Redis");
}

/* ───────────── MongoDB ───────────── */

let collection: Collection<SimulatedResponse> | null = null;

async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("⚠️  MONGODB_URI not set — responses will not be persisted.");
    return;
  }
  try {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db("ribs_simulator");
    collection = db.collection<SimulatedResponse>("responses");
    await collection.createIndex(
      { timestamp: 1 },
      { expireAfterSeconds: 3600 }
    );
    console.log("✅ Connected to MongoDB Atlas");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
  }
}

/* ───────────── Express + WebSocket Server ───────────── */

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(data: object) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

/* ───────────── Simulator (runs in one pod, controlled via Redis) ───────────── */

let simulatorInterval: ReturnType<typeof setInterval> | null = null;

async function setSimulatorRate(rate: number) {
  if (simulatorInterval) {
    clearInterval(simulatorInterval);
    simulatorInterval = null;
  }

  // Store rate in Redis so all pods know current state
  await redisClient.set("ribs:currentRate", String(rate));

  if (rate <= 0) {
    console.log("■ Simulator stopped");
    return;
  }

  const intervalMs = Math.floor(1000 / rate);

  simulatorInterval = setInterval(async () => {
    const response = generateResponse();

    // Persist to MongoDB
    if (collection) {
      try {
        await collection.insertOne({ ...response });
      } catch (err) {
        console.error("MongoDB insert error:", err);
      }
    }

    // Publish to Redis channel — all pods will receive and broadcast to their clients
    await publisher.publish(CHANNEL, JSON.stringify(response));
  }, intervalMs);

  console.log(`▶ Simulator running at ${rate} responses/sec`);
}

/* ───────────── Subscribe to Redis responses channel ───────────── */

async function startSubscriber() {
  await subscriber.subscribe(CHANNEL, (msg) => {
    try {
      const response = JSON.parse(msg);
      broadcast({ type: "response", data: response });
    } catch {
      // ignore malformed
    }
  });

  // Also subscribe to rate control channel so all pods stay in sync
  await subscriber.subscribe(RATE_CHANNEL, (msg) => {
    try {
      const { rate } = JSON.parse(msg);
      broadcast({ type: "status", running: rate > 0, rate });
    } catch {
      // ignore malformed
    }
  });

  console.log("✅ Subscribed to Redis channels");
}

/* ───────────── WebSocket connection handler ───────────── */

wss.on("connection", async (ws) => {
  console.log(`🔌 Client connected (${wss.clients.size} total)`);

  // Send current rate status
  const currentRate = Number(
    (await redisClient.get("ribs:currentRate")) ?? "0"
  );
  ws.send(
    JSON.stringify({
      type: "status",
      running: currentRate > 0,
      rate: currentRate,
    })
  );

  // Send last 50 responses from MongoDB for chart hydration
  if (collection) {
    try {
      const recent = await collection
        .find()
        .sort({ timestamp: -1 })
        .limit(50)
        .toArray();
      ws.send(JSON.stringify({ type: "history", data: recent.reverse() }));
    } catch (err) {
      console.error("History fetch error:", err);
    }
  }

  ws.on("message", async (msg) => {
    try {
      console.log("Received WS message:", msg.toString());
      const { type, rate } = JSON.parse(msg.toString());
      console.log("Parsed:", type, rate);
      if (type === "setRate") {
        const r = Number(rate);
        await setSimulatorRate(r);
        await publisher.publish(RATE_CHANNEL, JSON.stringify({ rate: r }));
        broadcast({ type: "status", running: r > 0, rate: r });
      }
    } catch (err) {
      console.error("Message handler error:", err);
    }
  });

  ws.on("close", () =>
    console.log(`🔌 Client disconnected (${wss.clients.size} remaining)`)
  );
});

/* ───────────── REST endpoints ───────────── */

app.get("/health", (_req, res) =>
  res.json({ status: "ok", pod: process.env.HOSTNAME ?? "local" })
);

app.get("/api/stats", async (_req, res) => {
  if (!collection) return res.json({ count: 0, avgRibs: null });
  try {
    const [countResult, avgResult] = await Promise.all([
      collection.countDocuments(),
      collection
        .aggregate([{ $group: { _id: null, avgRibs: { $avg: "$ribs" } } }])
        .toArray(),
    ]);
    res.json({ count: countResult, avgRibs: avgResult[0]?.avgRibs ?? null });
  } catch {
    res.status(500).json({ error: "Stats query failed" });
  }
});

app.post("/api/claude", async (req, res) => {
  const key = process.env.VITE_ANTHROPIC_API_KEY ?? "";
  console.log("API key length:", key.length);
  console.log("API key start:", key.slice(0, 10));
  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      req.body,
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.VITE_ANTHROPIC_API_KEY ?? "",
          "anthropic-version": "2023-06-01",
        },
      }
    );
    res.json(response.data);
  } catch (err) {
    console.error("Proxy error:", err?.response?.data ?? err.message);
    res
      .status(err?.response?.status ?? 500)
      .json(err?.response?.data ?? { error: { message: "Proxy error" } });
  }
});

/* ───────────── Boot ───────────── */

const PORT = Number(process.env.PORT ?? 3001);

async function boot() {
  await connectRedis();
  await connectMongo();
  await startSubscriber();

  server.listen(PORT, "0.0.0.0", () => {
    console.log(
      `🚀 Pod ${process.env.HOSTNAME ?? "local"} listening on port ${PORT}`
    );
  });
}

boot().catch(console.error);
