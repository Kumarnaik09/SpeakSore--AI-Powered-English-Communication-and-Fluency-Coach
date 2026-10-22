
import { useEffect, useRef, useState } from "react";
import "./App.css";

const PASSAGE =
  "Consistency is one of the most important habits for achieving success. Small improvements made every day can lead to remarkable results over time. Although progress may seem slow at first, patience and dedication help us overcome challenges and reach our goals.";

const FILLER_WORDS = new Set(["um", "uh", "erm", "er", "hmm"]);

const getWords = (text = "") =>
  text
    .toLowerCase()
    .replace(/[^\w'\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);

const normalizeWord = (word = "") =>
  word.toLowerCase().replace(/^[^\w']+|[^\w']+$/g, "");

function assessReading(expectedText, spokenText) {
  const expected = getWords(expectedText);
  const spoken = getWords(spokenText);

  const rows = expected.length + 1;
  const cols = spoken.length + 1;

  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost =
        normalizeWord(expected[i - 1]) === normalizeWord(spoken[j - 1])
          ? 0
          : 1;

      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  const comparison = [];
  let i = expected.length;
  let j = spoken.length;

  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      normalizeWord(expected[i - 1]) === normalizeWord(spoken[j - 1]) &&
      dp[i][j] === dp[i - 1][j - 1]
    ) {
      comparison.unshift({
        expected: expected[i - 1],
        spoken: spoken[j - 1],
        status: "correct",
      });
      i--;
      j--;
    } else if (
      i > 0 &&
      j > 0 &&
      dp[i][j] === dp[i - 1][j - 1] + 1
    ) {
      comparison.unshift({
        expected: expected[i - 1],
        spoken: spoken[j - 1],
        status: "substituted",
      });
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      comparison.unshift({
        expected: expected[i - 1],
        spoken: "",
        status: "missing",
      });
      i--;
    } else {
      comparison.unshift({
        expected: "",
        spoken: spoken[j - 1],
        status: "extra",
      });
      j--;
    }
  }

  const correct = comparison.filter((item) => item.status === "correct").length;
  const missing = comparison.filter((item) => item.status === "missing").length;
  const substituted = comparison.filter(
    (item) => item.status === "substituted"
  ).length;
  const extra = comparison.filter((item) => item.status === "extra").length;

  return {
    comparison,
    correct,
    missing,
    substituted,
    extra,
    score:
      expected.length > 0
        ? Math.max(
            0,
            Math.round(
              (1 - (missing + substituted + extra) / expected.length) * 100
            )
          )
        : 0,
  };
}

const initialFluency = {
  pauseCount: 0,
  totalPauseMs: 0,
  longestPauseMs: 0,
};

const styles = {
  page: {
    maxWidth: 1050,
    margin: "0 auto",
    padding: "24px 16px 48px",
    fontFamily: "Arial, sans-serif",
    color: "var(--text-color, #1f2937)",
  },
  panel: {
    border: "1px solid var(--border-color, #dbe1ea)",
    borderRadius: 14,
    padding: 20,
    marginTop: 18,
    background: "var(--card-background, #ffffff)",
  },
  button: {
    border: "none",
    borderRadius: 9,
    padding: "11px 17px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 14,
  },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 12,
    marginTop: 16,
  },
  metric: {
    border: "1px solid var(--border-color, #e2e8f0)",
    borderRadius: 10,
    padding: 14,
    minWidth: 0,
  },
  muted: {
    color: "var(--muted-color, #64748b)",
    fontSize: 13,
    lineHeight: 1.6,
  },
};

function Metric({ label, value, detail }) {
  return (
    <div style={styles.metric}>
      <div style={styles.muted}>{label}</div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          margin: "7px 0",
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
      {detail && <div style={styles.muted}>{detail}</div>}
    </div>
  );
}

export default function App() {
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [assessment, setAssessment] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [fluency, setFluency] = useState(initialFluency);
  const [lastPauseMs, setLastPauseMs] = useState(0);
  const [recognitionSupported, setRecognitionSupported] = useState(true);

  const recognitionRef = useRef(null);
  const transcriptRef = useRef("");
  const interimRef = useRef("");
  const shouldListenRef = useRef(false);
  const startedAtRef = useRef(null);
  const lastResultAtRef = useRef(null);
  const restartTimerRef = useRef(null);
  const finalizingRef = useRef(false);
  const fluencyRef = useRef(initialFluency);

  const expectedWords = getWords(PASSAGE);
  const liveText = [transcript, interim].filter(Boolean).join(" ").trim();
  const spokenWords = getWords(liveText);

  const liveAssessment = liveText
    ? assessReading(PASSAGE, liveText)
    : null;

  const progress = Math.min(
    100,
    Math.round((spokenWords.length / expectedWords.length) * 100)
  );

  const elapsedSeconds = elapsedMs / 1000;
  const minutes = elapsedSeconds / 60;

  const wpm =
    minutes > 0 ? Math.round(spokenWords.length / minutes) : 0;

  const fillerCount = spokenWords.filter((word) =>
    FILLER_WORDS.has(word)
  ).length;

  const pauseRate =
    minutes > 0 ? (fluency.pauseCount / minutes).toFixed(1) : "0.0";

  const averagePause =
    fluency.pauseCount > 0
      ? Math.round(fluency.totalPauseMs / fluency.pauseCount)
      : 0;

  // This is an indicative practice score, not an official fluency grade.
  const speedScore =
    wpm === 0
      ? 0
      : Math.max(0, 100 - Math.abs(wpm - 130) * 0.7);

  const pausePenalty = Math.min(35, fluency.pauseCount * 3);
  const fillerPenalty = Math.min(25, fillerCount * 5);

  const fluencyScore =
    spokenWords.length === 0
      ? 0
      : Math.round(
          Math.max(0, speedScore - pausePenalty - fillerPenalty)
        );

  useEffect(() => {
    if (!listening || !startedAtRef.current) return;

    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 250);

    return () => window.clearInterval(timer);
  }, [listening]);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      window.clearTimeout(restartTimerRef.current);

      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;

        try {
          recognitionRef.current.abort();
        } catch {
          // Recognition may already have stopped.
        }
      }
    };
  }, []);

  function updateFluency(updater) {
    const next =
      typeof updater === "function" ? updater(fluencyRef.current) : updater;

    fluencyRef.current = next;
    setFluency(next);
  }

  function finalizeAssessment() {
    if (finalizingRef.current) return;
    finalizingRef.current = true;

    const finalText = transcriptRef.current.trim();

    setInterim("");
    interimRef.current = "";

    if (finalText) {
      setAssessment(assessReading(PASSAGE, finalText));
    } else {
      setAssessment(null);
    }

    setTranscript(finalText);
    setElapsedMs(
      startedAtRef.current ? Date.now() - startedAtRef.current : 0
    );
  }

  function stopReading() {
    shouldListenRef.current = false;
    setListening(false);
    window.clearTimeout(restartTimerRef.current);

    const recognition = recognitionRef.current;

    if (recognition) {
      try {
        recognition.stop();
      } catch {
        finalizeAssessment();
      }
    } else {
      finalizeAssessment();
    }
  }

  function startReading() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setRecognitionSupported(false);
      setError(
        "Speech recognition is not supported in this browser. Try the latest Google Chrome."
      );
      return;
    }

    window.clearTimeout(restartTimerRef.current);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore an already stopped recognizer.
      }
    }

    transcriptRef.current = "";
    interimRef.current = "";
    fluencyRef.current = initialFluency;
    lastResultAtRef.current = null;
    startedAtRef.current = Date.now();
    finalizingRef.current = false;

    setTranscript("");
    setInterim("");
    setAssessment(null);
    setElapsedMs(0);
    setFluency(initialFluency);
    setLastPauseMs(0);
    setError("");
    setListening(true);

    shouldListenRef.current = true;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      const now = Date.now();

      // Approximate the gap between recognition-result events.
      // This is not a precise measurement of silence in the audio.
      if (lastResultAtRef.current !== null) {
        const gap = now - lastResultAtRef.current;

        if (gap >= 1000 && gap <= 15000) {
          setLastPauseMs(gap);

          updateFluency((previous) => ({
            pauseCount: previous.pauseCount + 1,
            totalPauseMs: previous.totalPauseMs + gap,
            longestPauseMs: Math.max(previous.longestPauseMs, gap),
          }));
        } else {
          setLastPauseMs(0);
        }
      }

      lastResultAtRef.current = now;

      let newlyFinalText = "";
      let interimText = "";

      // Rebuild interim text from current results, but append only
      // newly finalized results to the stored transcript.
      for (let index = 0; index < event.results.length; index++) {
        const result = event.results[index];
        const words = result[0]?.transcript?.trim() || "";

        if (result.isFinal) {
          if (index >= event.resultIndex && words) {
            newlyFinalText += words + " ";
          }
        } else if (words) {
          interimText += words + " ";
        }
      }

      if (newlyFinalText.trim()) {
        transcriptRef.current = [
          transcriptRef.current,
          newlyFinalText.trim(),
        ]
          .filter(Boolean)
          .join(" ");
      }

      interimRef.current = interimText.trim();

      setTranscript(transcriptRef.current);
      setInterim(interimRef.current);
    };

    recognition.onerror = (event) => {
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        setError(
          "Microphone permission was denied. Allow microphone access in Chrome site settings."
        );
        shouldListenRef.current = false;
        setListening(false);
        finalizeAssessment();
      } else if (event.error === "audio-capture") {
        setError("No microphone was detected. Check your microphone connection.");
        shouldListenRef.current = false;
        setListening(false);
        finalizeAssessment();
      } else if (event.error === "network") {
        setError(
          "Speech recognition reported a network error. Check your connection and try again."
        );
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      if (shouldListenRef.current) {
        // Chrome may end a recognition session automatically.
        restartTimerRef.current = window.setTimeout(() => {
          if (shouldListenRef.current) {
            try {
              recognition.start();
            } catch {
              // A start can fail if the previous session is still closing.
            }
          }
        }, 300);
      } else {
        finalizeAssessment();
      }
    };

    try {
      recognition.start();
    } catch (err) {
      setListening(false);
      shouldListenRef.current = false;
      setError(
        "Could not start speech recognition. Please try again. " +
          (err?.message || "")
      );
    }
  }

  function resetSession() {
    shouldListenRef.current = false;
    window.clearTimeout(restartTimerRef.current);

    const recognition = recognitionRef.current;
    recognitionRef.current = null;

    if (recognition) {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;

      try {
        recognition.abort();
      } catch {
        // Already stopped.
      }
    }

    transcriptRef.current = "";
    interimRef.current = "";
    startedAtRef.current = null;
    lastResultAtRef.current = null;
    finalizingRef.current = false;
    fluencyRef.current = initialFluency;

    setTranscript("");
    setInterim("");
    setListening(false);
    setError("");
    setAssessment(null);
    setElapsedMs(0);
    setFluency(initialFluency);
    setLastPauseMs(0);
  }

  const formatTime = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;

    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const statusColor = listening ? "#15803d" : "#64748b";

  return (
    <main style={styles.page}>
      <header>
        <h1 style={{ marginBottom: 6 }}>VoiceAgent</h1>
        <p style={styles.muted}>
          Real-time English reading, accuracy and fluency assessment
        </p>
      </header>

      <section style={styles.panel}>
        <h2 style={{ marginTop: 0 }}>Reading passage</h2>
        <p style={{ lineHeight: 1.9 }}>{PASSAGE}</p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {!listening ? (
            <button
              type="button"
              style={{ ...styles.button, background: "#2563eb", color: "#fff" }}
              onClick={startReading}
            >
              <span aria-hidden="true">🎙️ </span>
              Start Reading
            </button>
          ) : (
            <button
              type="button"
              style={{ ...styles.button, background: "#dc2626", color: "#fff" }}
              onClick={stopReading}
            >
              Stop Reading
            </button>
          )}

          <button
            type="button"
            style={{
              ...styles.button,
              background: "var(--button-secondary, #e5e7eb)",
              color: "var(--text-color, #1f2937)",
            }}
            onClick={resetSession}
          >
            Reset Session
          </button>
        </div>

        <p role="status" style={{ color: statusColor, fontWeight: 600 }}>
          {listening ? "● Listening — read the passage aloud" : "● Not listening"}
        </p>

        {error && (
          <p
            role="alert"
            style={{
              background: "#fef2f2",
              color: "#b91c1c",
              padding: 12,
              borderRadius: 8,
              lineHeight: 1.6,
            }}
          >
            {error}
          </p>
        )}

        {!recognitionSupported && (
          <p style={styles.muted}>
            Open this project in a supported browser such as desktop Chrome
            and allow microphone access.
          </p>
        )}
      </section>

      <section style={styles.panel}>
        <h2 style={{ marginTop: 0 }}>Live transcript</h2>

        <p style={{ lineHeight: 1.8, overflowWrap: "anywhere" }}>
          {transcript || (
            <span style={styles.muted}>
              Your recognized speech will appear here.
            </span>
          )}
          {interim && (
            <span style={{ color: "#64748b" }}> {interim}</span>
          )}
        </p>

        <div style={styles.metrics}>
          <Metric
            label="Words recognized"
            value={spokenWords.length}
            detail={`Passage: ${expectedWords.length} words`}
          />
          <Metric
            label="Reading progress"
            value={`${progress}%`}
            detail="Estimated by recognized word count"
          />
          <Metric
            label="Live word match"
            value={`${liveAssessment?.score ?? 0}%`}
            detail="Provisional passage match"
          />
        </div>

        <div
          style={{
            height: 9,
            background: "var(--border-color, #e5e7eb)",
            borderRadius: 20,
            overflow: "hidden",
            marginTop: 18,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: "#2563eb",
              transition: "width 200ms ease",
            }}
          />
        </div>
      </section>

      <section style={styles.panel}>
        <h2 style={{ marginTop: 0 }}>Phase 3 — Fluency analysis</h2>
        <p style={styles.muted}>
          These indicators update during reading. Pause detection is
          approximate because it uses the timing of browser recognition
          results, which may be delayed.
        </p>

        <div style={styles.metrics}>
          <Metric
            label="Speaking speed"
            value={`${wpm} WPM`}
            detail="Recognized words per elapsed minute"
          />
          <Metric
            label="Reading duration"
            value={formatTime(elapsedMs)}
            detail="Time since reading started"
          />
          <Metric
            label="Detected pauses"
            value={fluency.pauseCount}
            detail="Result gaps of at least 1 second"
          />
          <Metric
            label="Longest detected gap"
            value={
              fluency.longestPauseMs
                ? `${(fluency.longestPauseMs / 1000).toFixed(1)} s`
                : "—"
            }
            detail="Approximate, not audio-timestamped"
          />
          <Metric
            label="Average detected gap"
            value={averagePause ? `${(averagePause / 1000).toFixed(1)} s` : "—"}
            detail="Across detected pauses"
          />
          <Metric
            label="Filler words"
            value={fillerCount}
            detail="Recognized um, uh, erm, er and hmm"
          />
          <Metric
            label="Pauses per minute"
            value={pauseRate}
            detail="Approximate rate"
          />
          <Metric
            label="Indicative fluency score"
            value={`${fluencyScore}/100`}
            detail="Practice estimate, not an official grade"
          />
        </div>

        {lastPauseMs >= 1000 && listening && (
          <p style={{ ...styles.muted, marginTop: 14 }}>
            Most recent detected result gap: {(lastPauseMs / 1000).toFixed(1)}{" "}
            seconds.
          </p>
        )}

        <p style={{ ...styles.muted, marginTop: 16 }}>
          Practice guide: a steady pace around 100–160 WPM can be a useful
          starting target for this exercise. The ideal speed depends on
          the speaker, passage difficulty and purpose. This score uses a
          simple heuristic and should not be treated as a validated measure
          of English fluency.
        </p>
      </section>

      {assessment && (
        <section style={styles.panel}>
          <h2 style={{ marginTop: 0 }}>Final reading assessment</h2>

          <div style={styles.metrics}>
            <Metric
              label="Passage match"
              value={`${assessment.score}%`}
            />
            <Metric label="Correct words" value={assessment.correct} />
            <Metric label="Missing words" value={assessment.missing} />
            <Metric label="Substituted words" value={assessment.substituted} />
            <Metric label="Extra words" value={assessment.extra} />
          </div>

          <h3 style={{ marginTop: 24 }}>Word-by-word comparison</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {assessment.comparison.map((item, index) => {
              const colors = {
                correct: {
                  background: "#dcfce7",
                  color: "#166534",
                },
                missing: {
                  background: "#fee2e2",
                  color: "#991b1b",
                },
                substituted: {
                  background: "#fef3c7",
                  color: "#92400e",
                },
                extra: {
                  background: "#dbeafe",
                  color: "#1d4ed8",
                },
              };

              const label =
                item.status === "missing"
                  ? `Missing: ${item.expected}`
                  : item.status === "extra"
                    ? `Extra: ${item.spoken}`
                    : item.status === "substituted"
                      ? `${item.expected} → ${item.spoken}`
                      : item.spoken;

              return (
                <span
                  key={`${index}-${item.status}`}
                  title={item.status}
                  style={{
                    ...colors[item.status],
                    padding: "5px 8px",
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  {label}
                </span>
              );
            })}
          </div>

          <p style={{ ...styles.muted, marginTop: 16 }}>
            The word-match score measures recognized text against the
            passage. It does not evaluate pronunciation, intonation or
            whether a recognized word was spoken clearly.
          </p>
        </section>
      )}
    </main>
  );
}
