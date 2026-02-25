import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Task {
  id: number;
  text: string;
  done: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([
    { id: 1, text: "Build something great", done: false },
    { id: 2, text: "Ship it", done: false },
  ]);
  const [input, setInput] = useState<string>("");

  const addTask = (): void => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setTasks((prev) => [
      ...prev,
      { id: Date.now(), text: trimmed, done: false },
    ]);
    setInput("");
  };

  const toggleTask = (id: number): void => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  };

  const deleteTask = (id: number): void => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const remaining = tasks.filter((t) => !t.done).length;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <header style={styles.header}>
          <h1 style={styles.title}>tasks.</h1>
          <span style={styles.badge}>{remaining} left</span>
        </header>

        {/* Input */}
        <div style={styles.inputRow}>
          <input
            style={styles.input}
            type="text"
            placeholder="Add a new task…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
          />
          <button style={styles.addBtn} onClick={addTask}>
            +
          </button>
        </div>

        {/* List */}
        <ul style={styles.list}>
          {tasks.length === 0 && (
            <li style={styles.empty}>Nothing here. Add a task above.</li>
          )}
          {tasks.map((task) => (
            <li key={task.id} style={styles.item}>
              <button
                style={{
                  ...styles.check,
                  background: task.done ? "#6ee7b7" : "transparent",
                  borderColor: task.done ? "#6ee7b7" : "#cbd5e1",
                }}
                onClick={() => toggleTask(task.id)}
                aria-label="toggle"
              >
                {task.done && "✓"}
              </button>
              <span
                style={{
                  ...styles.taskText,
                  textDecoration: task.done ? "line-through" : "none",
                  color: task.done ? "#94a3b8" : "#1e293b",
                }}
              >
                {task.text}
              </span>
              <button
                style={styles.deleteBtn}
                onClick={() => deleteTask(task.id)}
                aria-label="delete"
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        {tasks.some((t) => t.done) && (
          <button
            style={styles.clearBtn}
            onClick={() => setTasks((prev) => prev.filter((t) => !t.done))}
          >
            Clear completed
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    width: "100vw", // Ensure it fills the full width of the viewport
    background: "#f1f5f9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Georgia', serif",
  },
  card: {
    background: "#ffffff",
    borderRadius: 16,
    boxShadow: "0 4px 32px rgba(0,0,0,0.08)",
    padding: "2rem",
    width: "100%",
    maxWidth: 420,
  },
  header: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: "1.5rem",
  },
  title: {
    fontSize: "2rem",
    fontWeight: 700,
    color: "#0f172a",
    margin: 0,
    letterSpacing: "-1px",
  },
  badge: {
    fontSize: "0.8rem",
    background: "#f1f5f9",
    color: "#64748b",
    padding: "4px 10px",
    borderRadius: 20,
    fontFamily: "monospace",
  },
  inputRow: {
    display: "flex",
    gap: 8,
    marginBottom: "1.25rem",
  },
  input: {
    flex: 1,
    padding: "10px 14px",
    border: "1.5px solid #e2e8f0",
    borderRadius: 10,
    fontSize: "0.95rem",
    outline: "none",
    fontFamily: "inherit",
    color: "#1e293b",
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    border: "none",
    background: "#0f172a",
    color: "#fff",
    fontSize: "1.5rem",
    cursor: "pointer",
    lineHeight: 1,
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  empty: {
    textAlign: "center",
    color: "#94a3b8",
    fontSize: "0.9rem",
    padding: "1rem 0",
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 10,
    background: "#f8fafc",
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    border: "1.5px solid #cbd5e1",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "#065f46",
    flexShrink: 0,
    transition: "all 0.15s",
  },
  taskText: {
    flex: 1,
    fontSize: "0.95rem",
    transition: "color 0.2s",
  },
  deleteBtn: {
    background: "none",
    border: "none",
    color: "#cbd5e1",
    fontSize: "1.2rem",
    cursor: "pointer",
    lineHeight: 1,
    padding: 0,
  },
  clearBtn: {
    marginTop: "1rem",
    width: "100%",
    padding: "8px",
    background: "none",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    color: "#94a3b8",
    fontSize: "0.85rem",
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
