import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";

/* ───────────── Types ───────────── */

type Range = { min: number; max: number };
type SliderConfig = { label: string; color: string };

interface SimulatedResponse {
  userId: string;
  timestamp: string;
  ranges: Range[];
  ribs: number;
  ctb: number;
  ab: number;
  erb: number;
}

/* ───────────── WebSocket Hook ───────────── */

function useSimulator() {
  const ws = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(false);
  const [rate, setRateState] = useState(0);
  const [responses, setResponses] = useState<SimulatedResponse[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    function connect() {
      const socket = new WebSocket(`ws://${window.location.host}/ws`);
      ws.current = socket;

      socket.onopen = () => setConnected(true);
      socket.onclose = () => {
        setConnected(false);
        setTimeout(connect, 2000); // auto-reconnect
      };

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === "status") {
          setRunning(msg.running);
          setRateState(msg.rate);
        }

        if (msg.type === "history") {
          setResponses(msg.data);
          setTotalCount(msg.data.length);
        }

        if (msg.type === "response") {
          setResponses((prev) => {
            const next = [...prev, msg.data];
            // Keep last 200 for charts
            return next.length > 200 ? next.slice(-200) : next;
          });
          setTotalCount((n) => n + 1);
        }
      };
    }

    connect();
    return () => ws.current?.close();
  }, []);

  const setRate = useCallback((r: number) => {
    console.log("setRate called:", r, "ws state:", ws.current?.readyState);
    ws.current?.send(JSON.stringify({ type: "setRate", rate: r }));
  }, []);

  return { connected, running, rate, responses, totalCount, setRate };
}

/* ───────────── Sparkline Chart ───────────── */

function Sparkline({
  data,
  color,
  height = 60,
}: {
  data: number[];
  color: string;
  height?: number;
}) {
  if (data.length < 2) return <div style={{ height }} />;

  const width = 400;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: "100%", height, display: "block" }}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ───────────── Live Dashboard (Page 3) ───────────── */

function Dashboard() {
  const { connected, running, rate, responses, totalCount, setRate } =
    useSimulator();
  const [sliderRate, setSliderRate] = useState(10);

  const ribsHistory = responses.map((r) => r.ribs);
  const ctbHistory = responses.map((r) => r.ctb);
  const erbHistory = responses.map((r) => r.erb);

  const avgRibs =
    responses.length > 0
      ? responses.reduce((a, b) => a + b.ribs, 0) / responses.length
      : null;

  const ribsColor =
    avgRibs === null
      ? "#475569"
      : avgRibs >= 0.7
      ? "#34d399"
      : avgRibs >= 0.4
      ? "#fbbf24"
      : "#f87171";

  const recentFeed = [...responses].reverse().slice(0, 8);

  return (
    <div>
      {/* Connection status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: connected ? "#34d399" : "#f87171",
          }}
        />
        <span
          style={{
            color: "#64748b",
            fontSize: "0.8rem",
            fontFamily: "monospace",
          }}
        >
          {connected ? "Connected" : "Reconnecting…"}
        </span>
        <span
          style={{
            marginLeft: "auto",
            color: "#475569",
            fontSize: "0.75rem",
            fontFamily: "monospace",
          }}
        >
          {totalCount.toLocaleString()} total responses
        </span>
      </div>

      {/* Rate control */}
      <div style={sectionBox}>
        <p style={sectionLabel}>Simulator Rate</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={sliderRate}
            onChange={(e) => setSliderRate(Number(e.target.value))}
            style={{ flex: 1, accentColor: "#818cf8" }}
          />
          <span
            style={{
              color: "#818cf8",
              fontFamily: "monospace",
              width: 80,
              textAlign: "right",
            }}
          >
            {sliderRate} req/s
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            onClick={() => setRate(sliderRate)}
            style={{
              ...btnStyle,
              flex: 1,
              background: running ? "#334155" : "#818cf8",
            }}
          >
            {running ? `▶ Running at ${rate}/s` : "▶ Start"}
          </button>
          <button
            onClick={() => setRate(0)}
            disabled={!running}
            style={{
              ...btnStyle,
              background: "#1e293b",
              border: "1px solid #334155",
              color: running ? "#f87171" : "#475569",
              cursor: running ? "pointer" : "not-allowed",
            }}
          >
            ■ Stop
          </button>
        </div>
      </div>

      {/* RIBS avg score */}
      <div style={{ ...sectionBox, marginTop: 12 }}>
        <p style={sectionLabel}>Rolling Average RIBS</p>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontSize: "2.5rem",
              fontWeight: 700,
              color: ribsColor,
              fontFamily: "monospace",
            }}
          >
            {avgRibs !== null ? (avgRibs * 100).toFixed(1) : "—"}
          </span>
          <span style={{ color: "#475569", fontSize: "0.875rem" }}>/ 100</span>
        </div>
        <Sparkline data={ribsHistory} color={ribsColor} />
      </div>

      {/* Sub-metric charts */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginTop: 12,
        }}
      >
        <div style={sectionBox}>
          <p style={sectionLabel}>CTB</p>
          <Sparkline data={ctbHistory} color="#818cf8" height={40} />
        </div>
        <div style={sectionBox}>
          <p style={sectionLabel}>ERB</p>
          <Sparkline data={erbHistory} color="#fbbf24" height={40} />
        </div>
      </div>

      {/* Live feed */}
      <div style={{ ...sectionBox, marginTop: 12 }}>
        <p style={sectionLabel}>Live Feed</p>
        {recentFeed.length === 0 && (
          <p
            style={{
              color: "#475569",
              fontSize: "0.8rem",
              fontFamily: "monospace",
            }}
          >
            Start the simulator to see responses…
          </p>
        )}
        {recentFeed.map((r, i) => {
          const rowColor =
            r.ribs >= 0.7 ? "#34d399" : r.ribs >= 0.4 ? "#fbbf24" : "#f87171";
          return (
            <div
              key={`${r.userId}-${i}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 0",
                borderBottom: "1px solid #1e293b",
                opacity: 1 - i * 0.1,
              }}
            >
              <span
                style={{
                  color: "#475569",
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  width: 90,
                }}
              >
                {r.userId}
              </span>
              <span
                style={{
                  color: "#64748b",
                  fontSize: "0.7rem",
                  fontFamily: "monospace",
                }}
              >
                {r.ranges.map((rng) => `${rng.min}–${rng.max}`).join("  ")}
              </span>
              <span
                style={{
                  color: rowColor,
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                }}
              >
                {(r.ribs * 100).toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── Bias Calculation ───────────── */

interface BiasResult {
  centralTendencyBias: number;
  acquiescenceBias: number;
  extremeResponseBias: number;
  ribs: number;
}

function calculateBias(ranges: Range[]): BiasResult {
  const midpoints = ranges.map((r) => (r.min + r.max) / 2);
  const spreads = ranges.map((r) => r.max - r.min);
  const avgMidpoint = midpoints.reduce((a, b) => a + b, 0) / midpoints.length;
  const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  const ctb = 1 - Math.abs(avgMidpoint - 5.5) / 4.5;
  const ab = (avgMidpoint - 5.5) / 4.5;
  const erb = avgSpread / 9;
  const ribs = ctb * 0.4 + (1 - Math.abs(ab)) * 0.3 + (1 - erb) * 0.3;
  return {
    centralTendencyBias: ctb,
    acquiescenceBias: ab,
    extremeResponseBias: erb,
    ribs,
  };
}

/* ───────────── Bias Panel ───────────── */

function BiasPanel({ ranges }: { ranges: Range[] }) {
  const bias = useMemo(() => calculateBias(ranges), [ranges]);
  const ribsColor =
    bias.ribs >= 0.7 ? "#34d399" : bias.ribs >= 0.4 ? "#fbbf24" : "#f87171";
  const abLabel =
    Math.abs(bias.acquiescenceBias) < 0.1
      ? "Neutral"
      : bias.acquiescenceBias > 0
      ? `Skewing High (+${(bias.acquiescenceBias * 100).toFixed(0)}%)`
      : `Skewing Low (${(bias.acquiescenceBias * 100).toFixed(0)}%)`;
  const abColor =
    Math.abs(bias.acquiescenceBias) < 0.1
      ? "#34d399"
      : Math.abs(bias.acquiescenceBias) < 0.3
      ? "#fbbf24"
      : "#f87171";

  return (
    <div style={biasPanelStyle}>
      <p style={biasTitleStyle}>Response Scale Interpretation Bias</p>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 20,
        }}
      >
        <span
          style={{
            fontSize: "2.5rem",
            fontWeight: 700,
            color: ribsColor,
            fontFamily: "monospace",
          }}
        >
          {(bias.ribs * 100).toFixed(1)}
        </span>
        <span style={{ color: "#475569", fontSize: "0.875rem" }}>
          / 100 RIBS score
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <BiasMetric
          label="Central Tendency Bias"
          description="How centered responses are around the midpoint"
          value={bias.centralTendencyBias}
          displayValue={`${(bias.centralTendencyBias * 100).toFixed(0)}%`}
          color="#818cf8"
          invert={false}
        />
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <span style={metricLabelStyle}>Acquiescence Bias</span>
            <span
              style={{
                fontSize: "0.8rem",
                color: abColor,
                fontFamily: "monospace",
              }}
            >
              {abLabel}
            </span>
          </div>
          <p style={metricDescStyle}>
            Whether respondents systematically skew high or low
          </p>
          <div
            style={{
              position: "relative",
              height: 6,
              background: "#1e293b",
              borderRadius: 3,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "50%",
                width: 2,
                height: "100%",
                background: "#334155",
              }}
            />
            <div
              style={{
                position: "absolute",
                height: "100%",
                borderRadius: 3,
                background: abColor,
                left:
                  bias.acquiescenceBias >= 0
                    ? "50%"
                    : `${(0.5 + bias.acquiescenceBias / 2) * 100}%`,
                width: `${(Math.abs(bias.acquiescenceBias) / 2) * 100}%`,
              }}
            />
          </div>
        </div>
        <BiasMetric
          label="Extreme Response Bias"
          description="Average range spread — wider means more uncertainty"
          value={bias.extremeResponseBias}
          displayValue={`${(bias.extremeResponseBias * 100).toFixed(0)}%`}
          color="#fbbf24"
          invert={true}
        />
      </div>
      <p
        style={{
          marginTop: 16,
          color: "#334155",
          fontSize: "0.7rem",
          fontFamily: "monospace",
        }}
      >
        RIBS = (CTB × 0.4) + ((1 − |AB|) × 0.3) + ((1 − ERB) × 0.3)
      </p>
    </div>
  );
}

function BiasMetric({
  label,
  value,
  displayValue,
  description,
  color,
  invert,
}: {
  label: string;
  value: number;
  displayValue: string;
  description: string;
  color: string;
  invert: boolean;
}) {
  const barColor = invert
    ? value > 0.6
      ? "#f87171"
      : value > 0.3
      ? "#fbbf24"
      : "#34d399"
    : color;
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <span style={metricLabelStyle}>{label}</span>
        <span
          style={{
            fontSize: "0.8rem",
            color: barColor,
            fontFamily: "monospace",
          }}
        >
          {displayValue}
        </span>
      </div>
      <p style={metricDescStyle}>{description}</p>
      <div style={{ height: 6, background: "#1e293b", borderRadius: 3 }}>
        <div
          style={{
            height: "100%",
            width: `${value * 100}%`,
            background: barColor,
            borderRadius: 3,
            transition: "width 0.3s ease, background 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

/* ───────────── Dual-Thumb Slider ───────────── */

function DualSlider({
  label,
  color,
  range,
  onChange,
  min = 1,
  max = 10,
  step = 1,
}: {
  label: string;
  color: string;
  range: Range;
  onChange: (r: Range) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const activeThumb = useRef<"min" | "max" | null>(null);
  const percent = (v: number) => ((v - min) / (max - min)) * 100;
  const valueFromX = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round((min + ratio * (max - min)) / step) * step;
  };
  const startDrag = (which: "min" | "max") => (e: React.MouseEvent) => {
    activeThumb.current = which;
    e.preventDefault();
  };
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!activeThumb.current) return;
      const v = valueFromX(e.clientX);
      if (activeThumb.current === "min")
        onChange({ min: Math.min(v, range.max - step), max: range.max });
      else onChange({ min: range.min, max: Math.max(v, range.min + step) });
    };
    const stop = () => (activeThumb.current = null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
  }, [range, step]);

  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ color: "#cbd5f5" }}>{label}</span>
        <span style={{ color, fontFamily: "monospace" }}>
          {range.min} – {range.max}
        </span>
      </div>
      <div ref={trackRef} style={trackStyle}>
        <div style={trackBg} />
        <div
          style={{
            ...trackFill,
            background: color,
            left: `${percent(range.min)}%`,
            width: `${percent(range.max) - percent(range.min)}%`,
          }}
        />
        <div
          style={{
            ...thumbStyle,
            left: `${percent(range.min)}%`,
            borderColor: color,
          }}
          onMouseDown={startDrag("min")}
        />
        <div
          style={{
            ...thumbStyle,
            left: `${percent(range.max)}%`,
            borderColor: color,
          }}
          onMouseDown={startDrag("max")}
        />
      </div>
      <div style={ticksStyle}>
        {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((n) => (
          <span
            key={n}
            style={{
              color: n >= range.min && n <= range.max ? color : "#475569",
              fontFamily: "monospace",
            }}
          >
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ───────────── Multi-Add Field ───────────── */

function MultiAddField({
  label,
  values,
  setValues,
}: {
  label: string;
  values: string[];
  setValues: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const [input, setInput] = useState("");
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ color: "#e5e7eb", margin: "0 0 10px" }}>{label}</h3>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              setValues([...values, input.trim()]);
              setInput("");
            }
          }}
          style={inputStyle}
          placeholder="Type and press Enter…"
        />
        <button
          onClick={() => {
            if (!input.trim()) return;
            setValues([...values, input.trim()]);
            setInput("");
          }}
          style={btnStyle}
        >
          Add
        </button>
      </div>
      <ul style={{ paddingLeft: 0, listStyle: "none", marginTop: 10 }}>
        {values.map((v, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "6px 10px",
              background: "#0f172a",
              borderRadius: 8,
              marginBottom: 6,
              color: "#cbd5e1",
              fontSize: "0.875rem",
            }}
          >
            {v}
            <button
              onClick={() => setValues(values.filter((_, x) => x !== i))}
              style={{
                background: "none",
                border: "none",
                color: "#64748b",
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────── Claude API Hook ───────────── */

function useClaudeQuery() {
  const [response, setResponse] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const query = async (listA: string[], listB: string[]) => {
    if (listA.length === 0 && listB.length === 0) return;
    setLoading(true);
    setError("");
    setResponse("");
    const prompt = `Evaluate the following survey questions:

    ${
      listA.length > 0
        ? listA.map((v, i) => `${i + 1}. ${v}`).join("\n")
        : "(no questions provided)"
    }
    
    I am trying to test my survey to make sure I'm evaluating for the following objectives:
    
    ${
      listB.length > 0
        ? listB.map((v, i) => `${i + 1}. ${v}`).join("\n")
        : "(no objectives provided)"
    }
    
    Tell me if my questions are effective enough to test for these objectives, or if there are other questions I could use to get to the point better.
    Don't give me tables in response, I can't format them.`;
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-opus-4-6",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e?.error?.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResponse(
        data.content
          .filter((b: { type: string }) => b.type === "text")
          .map((b: { text: unknown }) => b.text)
          .join("\n")
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return { response, loading, error, query };
}

/* ───────────── App ───────────── */

const SLIDERS: SliderConfig[] = [
  { label: "Slider A", color: "#818cf8" },
  { label: "Slider B", color: "#34d399" },
  { label: "Slider C", color: "#fbbf24" },
];

export default function App() {
  const [page, setPage] = useState<1 | 2 | 3>(1);
  const [ranges, setRanges] = useState<Range[]>([
    { min: 2, max: 7 },
    { min: 3, max: 8 },
    { min: 1, max: 5 },
  ]);
  const [listA, setListA] = useState<string[]>([]);
  const [listB, setListB] = useState<string[]>([]);
  const { response, loading, error, query } = useClaudeQuery();

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <nav style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          {([1, 2, 3] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              style={{ ...navBtn, ...(page === p ? navBtnActive : {}) }}
            >
              Part {p}
            </button>
          ))}
        </nav>

        {page === 1 && (
          <>
            <h2>Bias Simulator</h2>
            {SLIDERS.map((s, i) => (
              <DualSlider
                key={s.label}
                label={s.label}
                color={s.color}
                range={ranges[i]}
                onChange={(r) =>
                  setRanges((prev) => prev.map((x, idx) => (idx === i ? r : x)))
                }
              />
            ))}
            <BiasPanel ranges={ranges} />
          </>
        )}

        {page === 2 && (
          <>
            <h2>Objective Evaluator</h2>
            <MultiAddField
              label="List of Questions"
              values={listA}
              setValues={setListA}
            />
            <MultiAddField
              label="List of KPIs"
              values={listB}
              setValues={setListB}
            />
            <button
              onClick={() => query(listA, listB)}
              disabled={loading || (listA.length === 0 && listB.length === 0)}
              style={{
                ...btnStyle,
                width: "100%",
                marginTop: 8,
                opacity:
                  loading || (listA.length === 0 && listB.length === 0)
                    ? 0.5
                    : 1,
                cursor:
                  loading || (listA.length === 0 && listB.length === 0)
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {loading ? "Thinking…" : "Send to Claude"}
            </button>
            {error && (
              <div
                style={{
                  marginTop: 16,
                  padding: "12px 16px",
                  background: "#450a0a",
                  border: "1px solid #7f1d1d",
                  borderRadius: 10,
                  color: "#fca5a5",
                  fontSize: "0.875rem",
                  fontFamily: "monospace",
                }}
              >
                Error: {error}
              </div>
            )}
            {response && (
              <div style={responseBox}>
                <p style={responseLabel}>Claude's Response</p>
                <div
                  style={{
                    color: "#e2e8f0",
                    lineHeight: 1.7,
                    margin: 0,
                    fontFamily: "monospace",
                  }}
                >
                  <ReactMarkdown>{response}</ReactMarkdown>
                </div>
              </div>
            )}
          </>
        )}

        {page === 3 && (
          <>
            <h2>Calculation Load Test</h2>
            <Dashboard />
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────── Styles ───────────── */

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  width: "100vw",
  background: "#0f172a",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  paddingTop: "3rem",
  boxSizing: "border-box",
};
const cardStyle: React.CSSProperties = {
  background: "#1e293b",
  padding: "2.5rem",
  borderRadius: 20,
  width: "100%",
  maxWidth: 520,
};
const navBtn: React.CSSProperties = {
  padding: "6px 18px",
  borderRadius: 8,
  border: "1px solid #334155",
  background: "transparent",
  color: "#64748b",
  cursor: "pointer",
  fontSize: "0.875rem",
};
const navBtnActive: React.CSSProperties = {
  background: "#334155",
  color: "#f1f5f9",
  border: "1px solid #475569",
};
const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "8px 12px",
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 8,
  color: "#f1f5f9",
  fontSize: "0.875rem",
  outline: "none",
};
const btnStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "#818cf8",
  border: "none",
  borderRadius: 8,
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.875rem",
};
const responseBox: React.CSSProperties = {
  marginTop: 20,
  padding: "16px 20px",
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 12,
};
const responseLabel: React.CSSProperties = {
  color: "#64748b",
  fontSize: "0.7rem",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  fontFamily: "monospace",
  margin: "0 0 10px",
};
const biasPanelStyle: React.CSSProperties = {
  marginTop: 8,
  padding: "1.25rem 1.5rem",
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 14,
};
const biasTitleStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: "0.7rem",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  fontFamily: "monospace",
  margin: "0 0 12px",
};
const metricLabelStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: "0.8rem",
  fontWeight: 600,
};
const metricDescStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: "0.72rem",
  margin: "2px 0 6px",
};
const sectionBox: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 12,
  padding: "1rem 1.25rem",
};
const sectionLabel: React.CSSProperties = {
  color: "#475569",
  fontSize: "0.7rem",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  fontFamily: "monospace",
  margin: "0 0 10px",
};
const trackStyle: React.CSSProperties = {
  position: "relative",
  height: 36,
  marginTop: 8,
};
const trackBg: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: 0,
  right: 0,
  height: 4,
  background: "#334155",
  transform: "translateY(-50%)",
};
const trackFill: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  height: 4,
  transform: "translateY(-50%)",
};
const thumbStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  width: 22,
  height: 22,
  borderRadius: "50%",
  background: "#1e293b",
  border: "3px solid",
  transform: "translate(-50%, -50%)",
  cursor: "pointer",
};
const ticksStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginTop: 6,
};
