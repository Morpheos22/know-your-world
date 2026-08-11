import { useState, useCallback, useRef, useEffect } from "react";
import type {
  Screen,
  Continent,
  Category,
  GameState,
  QueueItem,
} from "./data/types";
import { getQuestionsForLevel } from "./data";
import { FACTS } from "./data/facts";
import { usePlayer } from "./hooks/usePlayer";
import { useSfx, type SoundName } from "./hooks/useSfx";
import { useScores } from "./hooks/useScores";
import { useProgress } from "./hooks/useProgress";

const PASS_THRESHOLD = 4; // out of 8 questions (50% — facts don't count)

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Confetti with a concurrent-element cap to prevent DOM pileup
let activeConfetti = 0;
const MAX_CONFETTI = 60;
function triggerConfetti() {
  if (activeConfetti >= MAX_CONFETTI) return;
  const batch = Math.min(30, MAX_CONFETTI - activeConfetti);
  for (let i = 0; i < batch; i++) {
    activeConfetti++;
    const c = document.createElement("div");
    c.className = "confetti";
    c.style.left = Math.random() * 100 + "%";
    c.style.top = "-10px";
    c.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
    c.style.animationDuration = Math.random() * 2 + 1 + "s";
    document.body.appendChild(c);
    setTimeout(() => {
      c.remove();
      activeConfetti--;
    }, 3000);
  }
}

// ============================================================================
// Level metadata
// ============================================================================

const LEVEL_META: Record<number, { label: string; color: string }> = {
  1: { label: "Easy", color: "var(--success)" },
  2: { label: "Medium", color: "#E0A526" },
  3: { label: "Hard", color: "var(--error)" },
};

// ============================================================================
// Mute button
// ============================================================================

function MuteButton({
  muted,
  onToggle,
}: {
  muted: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className="mute-btn"
      onClick={onToggle}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      title={
        muted ? "Sound off — click to turn on" : "Sound on — click to mute"
      }
    >
      {muted ? "\uD83D\uDD07" : "\uD83D\uDD0A"}
    </button>
  );
}

// ============================================================================
// Globe (existing, unchanged)
// ============================================================================

function Globe() {
  const ref = useRef<HTMLDivElement>(null);
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    tapCount.current++;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    el.classList.remove("globe-spin", "globe-bounce", "globe-shrink");
    void el.offsetWidth;
    if (tapCount.current === 1) el.classList.add("globe-spin");
    else if (tapCount.current === 2) el.classList.add("globe-bounce");
    else if (tapCount.current >= 3) {
      el.classList.add("globe-shrink");
      tapCount.current = 0;
    }
    tapTimer.current = setTimeout(() => {
      tapCount.current = 0;
    }, 1000);
  }, []);

  return <div className="globe-container" ref={ref} onClick={handleClick} />;
}

// ============================================================================
// Home / Name Entry screen
// ============================================================================

function HomeScreen({
  playerName,
  onSetName,
  onStart,
  onShowLeaderboard,
  tracksCompleted,
  tracksStarted,
  play,
}: {
  playerName: string | null;
  onSetName: (raw: string) => { ok: true } | { ok: false; error: string };
  onStart: () => void;
  onShowLeaderboard: () => void;
  tracksCompleted: number;
  tracksStarted: number;
  play: (s: SoundName) => void;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!playerName && inputRef.current) {
      inputRef.current.focus();
    }
  }, [playerName]);

  const handleStart = useCallback(() => {
    if (playerName) {
      play("click");
      onStart();
      return;
    }
    const result = onSetName(input);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    play("click");
    onStart();
  }, [playerName, input, onSetName, onStart, play]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleStart();
      }
    },
    [handleStart],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (error) setError(null);
  };

  return (
    <div className="screen screen-home">
      <div className="title-text">Know Your World</div>
      <div className="subtitle">V2 | World Edition</div>
      <Globe />

      {!playerName ? (
        <div className="name-entry">
          <label htmlFor="player-name" className="name-label">
            What's your name, explorer?
          </label>
          <input
            id="player-name"
            ref={inputRef}
            type="text"
            className="name-input"
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Type your name here..."
            maxLength={20}
            autoComplete="off"
            spellCheck={false}
            aria-label="Your name"
          />
          {error && (
            <div className="name-error" role="alert">
              {error}
            </div>
          )}
          <button
            className="menu-btn"
            onClick={handleStart}
            style={{ marginTop: 16 }}
          >
            Let's Go!
          </button>
        </div>
      ) : (
        <>
          <p className="welcome-text">
            Welcome back, <strong>{playerName}</strong>!
          </p>
          {(tracksStarted > 0 || tracksCompleted > 0) && (
            <div className="home-progress">
              <span className="progress-pill">
                {tracksStarted}/16 tracks started
              </span>
              <span className="progress-pill progress-pill-done">
                {tracksCompleted}/16 completed
              </span>
            </div>
          )}
          <div
            style={{
              marginTop: 24,
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <button className="menu-btn" onClick={handleStart}>
              START GAME
            </button>
            <button
              className="menu-btn menu-btn-secondary"
              onClick={() => {
                play("click");
                onShowLeaderboard();
              }}
            >
              {"\uD83C\uDFC6"} Leaderboard
            </button>
          </div>
          <button
            className="not-me-btn"
            onClick={() => {
              play("click");
              onSetName("");
              setInput(playerName);
            }}
          >
            Not {playerName}? Click here
          </button>
        </>
      )}

      <div className="footer">
        Know Your World V2
        <br />
        Developed by Faiza Fadipe
        <br />
        2025
      </div>
    </div>
  );
}

// ============================================================================
// Continent Selection — with per-continent progress
// ============================================================================

const CONTINENTS: { name: Continent; icon: string }[] = [
  { name: "Africa", icon: "\uD83C\uDF0D" },
  { name: "Asia", icon: "\u26E9\uFE0F" },
  { name: "Europe", icon: "\uD83C\uDFF0" },
  { name: "Americas", icon: "\uD83D\uDDFD" },
];

function ContinentScreen({
  playerName,
  onSelect,
  onBack,
  play,
  getContinentProgress,
}: {
  playerName: string;
  onSelect: (c: Continent) => void;
  onBack: () => void;
  play: (s: SoundName) => void;
  getContinentProgress: (c: Continent) => {
    started: number;
    completed: number;
  };
}) {
  return (
    <>
      <div className="header">
        <button
          className="back-btn"
          onClick={() => {
            play("click");
            onBack();
          }}
          aria-label="Back"
        >
          {"\u2B05\uFE0F"}
        </button>
        <h2>Select Continent</h2>
        <div style={{ width: 24 }} />
      </div>
      <div className="breadcrumb">Player: {playerName}</div>
      <div className="screen">
        <div className="grid">
          {CONTINENTS.map((c) => {
            const prog = getContinentProgress(c.name);
            return (
              <div
                className="tile"
                key={c.name}
                role="button"
                tabIndex={0}
                onClick={() => {
                  play("click");
                  onSelect(c.name);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    play("click");
                    onSelect(c.name);
                  }
                }}
              >
                <span className="tile-icon">{c.icon}</span>
                <h3>{c.name}</h3>
                <div className="tile-progress">
                  {prog.started}/4 started
                  {prog.completed > 0 && (
                    <span className="tile-completed">
                      {" \u2713".repeat(prog.completed)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Category Selection — with per-category progress
// ============================================================================

const CATEGORIES: { name: Category; icon: string; label: string }[] = [
  {
    name: "Countries",
    icon: "\uD83D\uDDFA\uFE0F",
    label: "Countries & Capitals",
  },
  {
    name: "Presidents",
    icon: "\uD83D\uDC68\u200D\u2696\uFE0F",
    label: "Presidents / Leaders",
  },
  { name: "Flags", icon: "\uD83C\uDFF3\uFE0F", label: "Flags" },
  { name: "Currencies", icon: "\uD83D\uDCB0", label: "Currencies" },
];

function CategoryScreen({
  playerName,
  continent,
  onSelect,
  onBack,
  play,
  getCategoryProgress,
}: {
  playerName: string;
  continent: Continent;
  onSelect: (cat: Category) => void;
  onBack: () => void;
  play: (s: SoundName) => void;
  getCategoryProgress: (cat: Category) => {
    levelsPassed: number;
    bestScore: number | null;
    total: number;
  };
}) {
  return (
    <>
      <div className="header">
        <button
          className="back-btn"
          onClick={() => {
            play("click");
            onBack();
          }}
          aria-label="Back"
        >
          {"\u2B05\uFE0F"}
        </button>
        <h2>{continent}</h2>
        <div style={{ width: 24 }} />
      </div>
      <div className="breadcrumb">
        {playerName} · {continent}
      </div>
      <div className="screen">
        <div
          style={{
            padding: "20px 0",
            textAlign: "center",
            color: "var(--primary-dark)",
          }}
        >
          <h3>Select Category</h3>
        </div>
        <div className="grid">
          {CATEGORIES.map((cat) => {
            const prog = getCategoryProgress(cat.name);
            return (
              <div
                className="tile"
                key={cat.name}
                role="button"
                tabIndex={0}
                onClick={() => {
                  play("click");
                  onSelect(cat.name);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    play("click");
                    onSelect(cat.name);
                  }
                }}
              >
                <span className="tile-icon">{cat.icon}</span>
                <h3>{cat.label}</h3>
                {prog.levelsPassed > 0 ? (
                  <div className="tile-progress">
                    {prog.levelsPassed}/3 levels
                    {prog.bestScore !== null && (
                      <span className="tile-best">
                        Best: {prog.bestScore}/{prog.total}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="tile-progress tile-progress-new">New!</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Level / Difficulty Selection — with unlock + best-score indicators
// ============================================================================

function LevelScreen({
  playerName,
  continent,
  category,
  onSelect,
  onBack,
  play,
  getLevelInfo,
}: {
  playerName: string;
  continent: Continent;
  category: Category;
  onSelect: (level: number) => void;
  onBack: () => void;
  play: (s: SoundName) => void;
  getLevelInfo: (level: number) => {
    unlocked: boolean;
    bestScore: number | null;
    total: number;
    passed: boolean;
  };
}) {
  return (
    <>
      <div className="header">
        <button
          className="back-btn"
          onClick={() => {
            play("click");
            onBack();
          }}
          aria-label="Back"
        >
          {"\u2B05\uFE0F"}
        </button>
        <h2>{category}</h2>
        <div style={{ width: 24 }} />
      </div>
      <div className="breadcrumb">
        {playerName} · {continent} · {category}
      </div>
      <div className="screen">
        <div
          style={{
            padding: "20px 0",
            textAlign: "center",
            color: "var(--primary-dark)",
          }}
        >
          <h3>Choose Difficulty</h3>
        </div>
        <div className="level-grid">
          {[1, 2, 3].map((lvl) => {
            const info = getLevelInfo(lvl);
            const meta = LEVEL_META[lvl];
            return (
              <button
                key={lvl}
                className={`level-card${info.unlocked ? "" : " level-locked"}`}
                disabled={!info.unlocked}
                onClick={() => {
                  play("click");
                  onSelect(lvl);
                }}
                style={!info.unlocked ? undefined : { borderColor: meta.color }}
              >
                <div
                  className="level-card-badge"
                  style={{ background: meta.color }}
                >
                  {info.unlocked ? `LEVEL ${lvl}` : "\uD83D\uDD12"}
                </div>
                <div className="level-card-label">{meta.label}</div>
                {info.unlocked ? (
                  info.bestScore !== null ? (
                    <div className="level-card-best">
                      Best: {info.bestScore}/{info.total}
                      {info.passed && (
                        <span className="level-card-passed">{" \u2713"}</span>
                      )}
                    </div>
                  ) : (
                    <div className="level-card-best level-card-new">
                      Not played yet
                    </div>
                  )
                ) : (
                  <div className="level-card-locked-msg">
                    Pass Level {lvl - 1} to unlock
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Game Screen — with relational HUD
// ============================================================================

function GameScreen({
  state,
  playerName,
  onAnswer,
  onFactContinue,
  onExit,
  play,
}: {
  state: GameState;
  playerName: string;
  onAnswer: (selected: string, correct: string) => void;
  onFactContinue: () => void;
  onExit: () => void;
  play: (s: SoundName) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [shuffledOpts, setShuffledOpts] = useState<string[]>([]);
  const item = state.queue[state.qIndex];

  // BUGFIX: depend only on qIndex, not on `item` (which changes identity each render)
  useEffect(() => {
    setSelected(null);
    setDisabled(false);
    if (item?.type === "question" && item.data) {
      setShuffledOpts(shuffle(item.data.opts));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.qIndex]);

  if (!item) return null;

  const handleSelect = (opt: string) => {
    if (disabled || !item.data) return;
    setSelected(opt);
    setDisabled(true);
    const isCorrect = opt === item.data.a;
    play(isCorrect ? "correct" : "wrong");
    setTimeout(() => {
      onAnswer(opt, item.data!.a);
    }, 1000);
  };

  const handleFactContinue = () => {
    play("fact");
    onFactContinue();
  };

  const correctAnswer = item.data?.a;

  // ---- Relational HUD computations ----
  // totalQuestions excludes fact cards (set at loadLevel time).
  // questionsAnswered tracks only real questions answered (correct or wrong).
  const totalQuestions = state.totalQuestions;
  const currentQuestionNum = state.questionsAnswered + (disabled ? 0 : 1);
  // Questions remaining = total - answered - (1 if currently on an unanswered question)
  const questionsRemaining =
    totalQuestions - state.questionsAnswered - (disabled ? 0 : 1);
  const maxPossibleScore = state.score + Math.max(0, questionsRemaining);
  const levelMeta = LEVEL_META[state.level] ?? LEVEL_META[1];
  const questionProgressPct =
    totalQuestions > 0 ? (state.questionsAnswered / totalQuestions) * 100 : 0;
  const scoreProgressPct =
    totalQuestions > 0 ? (state.score / totalQuestions) * 100 : 0;
  const maxPossiblePct =
    totalQuestions > 0 ? (maxPossibleScore / totalQuestions) * 100 : 0;

  return (
    <>
      <div className="header">
        <button
          className="back-btn"
          onClick={() => {
            play("click");
            setConfirmExit(true);
          }}
          aria-label="Exit game"
        >
          {"\u2716\uFE0F"}
        </button>
        <h2>Level {state.level}</h2>
        <div style={{ width: 24 }} />
      </div>

      {/* 4-quadrant relational HUD */}
      <div className="hud">
        <div className="hud-row">
          <div className="hud-cell hud-cell-tl">
            <div className="hud-label">Player</div>
            <div
              className="hud-value"
              title={`${playerName} · ${state.continent} · ${state.category}`}
            >
              {playerName} · {state.continent} · {state.category}
            </div>
          </div>
          <div className="hud-cell hud-cell-tr">
            <div className="hud-label">Level {state.level} of 3</div>
            <div
              className="hud-value"
              style={{ color: levelMeta.color, fontWeight: 700 }}
            >
              {levelMeta.label}
            </div>
          </div>
        </div>
        <div className="hud-row">
          <div className="hud-cell hud-cell-bl">
            <div className="hud-label">
              {item.type === "fact" ? (
                <>{"\uD83D\uDCA1"} Fun fact!</>
              ) : (
                <>
                  Question {currentQuestionNum} of {totalQuestions}
                </>
              )}
            </div>
            <div className="hud-bar">
              <div
                className="hud-bar-fill hud-bar-question"
                style={{ width: `${questionProgressPct}%` }}
              />
            </div>
          </div>
          <div className="hud-cell hud-cell-br">
            <div className="hud-label">
              Score: {state.score} / {totalQuestions}
            </div>
            <div className="hud-bar">
              <div
                className="hud-bar-fill hud-bar-max"
                style={{ width: `${maxPossiblePct}%` }}
              />
              <div
                className="hud-bar-fill hud-bar-score"
                style={{ width: `${scoreProgressPct}%` }}
              />
            </div>
            <div className="hud-sublabel">
              {item.type === "fact"
                ? "Facts don't affect your score"
                : `Can still reach ${maxPossibleScore}/${totalQuestions}`}
            </div>
          </div>
        </div>
      </div>

      <div className="screen">
        <div style={{ padding: "10px 0" }}>
          <div className="level-badge" style={{ background: levelMeta.color }}>
            LEVEL {state.level} — {levelMeta.label.toUpperCase()}
          </div>
          <div
            className={`question-card${item.type === "fact" ? " fact-card" : ""}`}
          >
            {item.type === "fact" ? (
              <>
                <div className="fact-label">{"\uD83D\uDCA1"} DID YOU KNOW?</div>
                <div className="q-text">{item.text}</div>
                <div className="options-list">
                  <button
                    className="opt-btn"
                    style={{ textAlign: "center", fontWeight: "bold" }}
                    onClick={handleFactContinue}
                  >
                    I didn't know that! (Continue)
                  </button>
                </div>
              </>
            ) : (
              <>
                {item.data?.flag && (
                  <span className="flag-emoji">{item.data.flag}</span>
                )}
                <div className="q-text">{item.data?.q}</div>
                <div className="options-list">
                  {shuffledOpts.map((opt) => {
                    let cls = "opt-btn";
                    if (selected !== null) {
                      if (opt === correctAnswer) cls += " correct";
                      else if (opt === selected) cls += " wrong";
                    }
                    return (
                      <button
                        key={opt}
                        className={cls}
                        disabled={disabled}
                        onClick={() => handleSelect(opt)}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Custom inline exit confirmation (replaces window.confirm) */}
      {confirmExit && (
        <div className="modal-overlay" onClick={() => setConfirmExit(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: 12 }}>Quit this game?</h2>
            <p style={{ marginBottom: 16, color: "#666" }}>
              Your progress on this level won't be saved.
            </p>
            <button
              className="menu-btn"
              style={{ width: "100%", background: "var(--error)" }}
              onClick={() => {
                play("click");
                setConfirmExit(false);
                onExit();
              }}
            >
              Yes, quit
            </button>
            <button
              className="modal-home-btn"
              onClick={() => {
                play("click");
                setConfirmExit(false);
              }}
            >
              Keep playing
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================================
// Result Modal — with score submission + leaderboard preview
// ============================================================================

function ResultModal({
  state,
  playerName,
  submission,
  leaderboard,
  onNextLevel,
  onRetry,
  onReplay,
  onHome,
  onShowLeaderboard,
  play,
}: {
  state: GameState;
  playerName: string;
  submission:
    | { ok: true; data: import("./hooks/useScores").ScoreSubmissionResult }
    | { ok: false; error: string }
    | null;
  leaderboard:
    | { ok: true; data: import("./hooks/useScores").LeaderboardResult }
    | { ok: false; error: string }
    | null;
  onNextLevel: () => void;
  onRetry: () => void;
  onReplay: () => void;
  onHome: () => void;
  onShowLeaderboard: () => void;
  play: (s: SoundName) => void;
}) {
  const total = state.totalQuestions; // excludes fact cards
  const passed = state.score >= PASS_THRESHOLD;
  const canGoNextLevel = passed && state.level < 3;

  useEffect(() => {
    if (passed) {
      play("levelPassed");
      triggerConfetti();
    } else {
      play("levelFailed");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isHighScore = submission?.ok ? submission.data.isHighScore : false;
  const rank = submission?.ok ? submission.data.rank : null;
  const totalEntries = submission?.ok ? submission.data.totalEntries : null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ fontSize: "4rem", marginBottom: 10 }}>
          {passed ? "\uD83C\uDF89" : "\uD83D\uDCDA"}
        </div>
        <h2
          style={{
            marginBottom: 10,
            color: passed ? "var(--success)" : "var(--error)",
          }}
        >
          {passed ? "Congratulations!" : "Study Hard!"}
        </h2>
        <p>
          You scored {state.score}/{total}
        </p>

        {isHighScore && (
          <div className="result-personal-best">
            {"\u2B50"} New personal best!
          </div>
        )}

        {/* Leaderboard preview */}
        {rank !== null && totalEntries !== null && (
          <div className="result-leaderboard-preview">
            {totalEntries > 1 ? (
              <>
                You're <strong>#{rank}</strong> on the {state.continent} ·{" "}
                {state.category} · {LEVEL_META[state.level].label} leaderboard
                (out of {totalEntries} players)
              </>
            ) : (
              <>You're the first player on this leaderboard!</>
            )}
          </div>
        )}
        {submission && !submission.ok && (
          <div className="result-leaderboard-preview result-leaderboard-error">
            Couldn't save score: {submission.error}
          </div>
        )}

        {/* Top 5 mini leaderboard */}
        {leaderboard?.ok && leaderboard.data.entries.length > 0 && (
          <div className="result-top5">
            <div className="result-top5-title">
              Top {leaderboard.data.entries.length} on this track
            </div>
            {leaderboard.data.entries.slice(0, 5).map((entry) => {
              const isMe =
                entry.name.toLowerCase() === playerName.toLowerCase();
              return (
                <div
                  key={`${entry.rank}-${entry.name}`}
                  className={`result-top5-row${isMe ? " result-top5-me" : ""}`}
                >
                  <span className="result-top5-rank">#{entry.rank}</span>
                  <span className="result-top5-name">{entry.name}</span>
                  <span className="result-top5-score">
                    {entry.score}/{entry.total}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {passed && state.level === 3 && (
          <div className="fact-reveal">
            Theme Fact: Did you know? Learning about other cultures increases
            empathy and global awareness!
          </div>
        )}

        <button
          className="menu-btn"
          style={{ width: "100%", marginTop: 10 }}
          onClick={() => {
            play("click");
            if (!passed) onRetry();
            else if (state.level === 3) onReplay();
            else onNextLevel();
          }}
        >
          {!passed
            ? "Try Level Again"
            : state.level === 3
              ? "Replay Category"
              : `Go to Level ${state.level + 1}`}
        </button>
        {canGoNextLevel && (
          <button
            className="modal-home-btn"
            onClick={() => {
              play("click");
              onRetry();
            }}
          >
            Replay this level
          </button>
        )}
        <button
          className="modal-home-btn"
          onClick={() => {
            play("click");
            onShowLeaderboard();
          }}
        >
          {"\uD83C\uDFC6"} View full leaderboard
        </button>
        <button
          className="modal-home-btn"
          onClick={() => {
            play("click");
            onHome();
          }}
        >
          Back to Menu
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Standalone Leaderboard screen
// ============================================================================

function LeaderboardScreen({
  onBack,
  fetchLeaderboard,
  play,
}: {
  onBack: () => void;
  fetchLeaderboard: (params: {
    continent: Continent;
    category: Category;
    level: number;
    limit?: number;
  }) => Promise<
    | { ok: true; data: import("./hooks/useScores").LeaderboardResult }
    | { ok: false; error: string }
  >;
  play: (s: SoundName) => void;
}) {
  const [continent, setContinent] = useState<Continent>("Africa");
  const [category, setCategory] = useState<Category>("Countries");
  const [level, setLevel] = useState<number>(1);
  const [data, setData] = useState<
    import("./hooks/useScores").LeaderboardResult | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchLeaderboard({
      continent,
      category,
      level,
      limit: 50,
    });
    if (result.ok) {
      setData(result.data);
    } else {
      setError(result.error);
      setData(null);
    }
    setLoading(false);
  }, [continent, category, level, fetchLeaderboard]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="header">
        <button
          className="back-btn"
          onClick={() => {
            play("click");
            onBack();
          }}
          aria-label="Back"
        >
          {"\u2B05\uFE0F"}
        </button>
        <h2>{"\uD83C\uDFC6"} Leaderboard</h2>
        <div style={{ width: 24 }} />
      </div>
      <div className="screen">
        <div className="lb-filters">
          <label>
            Continent
            <select
              value={continent}
              onChange={(e) => setContinent(e.target.value as Continent)}
            >
              {CONTINENTS.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Level
            <select
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
            >
              <option value={1}>Easy</option>
              <option value={2}>Medium</option>
              <option value={3}>Hard</option>
            </select>
          </label>
        </div>

        {loading && <div className="lb-loading">Loading...</div>}
        {error && <div className="lb-error">Couldn't load: {error}</div>}
        {!loading && !error && data && (
          <>
            <div className="lb-meta">
              {data.totalEntries}{" "}
              {data.totalEntries === 1 ? "player" : "players"} on this track
            </div>
            {data.entries.length === 0 ? (
              <div className="lb-empty">
                No scores yet — be the first to play this track!
              </div>
            ) : (
              <div className="lb-list">
                {data.entries.map((entry) => (
                  <div key={`${entry.rank}-${entry.name}`} className="lb-row">
                    <span
                      className={`lb-rank lb-rank-${entry.rank <= 3 ? "top" : "normal"}`}
                    >
                      #{entry.rank}
                    </span>
                    <span className="lb-name">{entry.name}</span>
                    <span className="lb-score">
                      {entry.score}/{entry.total}
                    </span>
                    <span className="lb-time">
                      {(entry.timeMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ============================================================================
// App root
// ============================================================================

function App() {
  const { name: playerName, hydrated, setName, clearName } = usePlayer();
  const { play, muted, toggleMute } = useSfx();
  const { submitScore, fetchLeaderboard } = useScores();
  const progress = useProgress();
  const [screen, setScreen] = useState<Screen>("home");
  const [bgGradient, setBgGradient] = useState("none");
  const [gameState, setGameState] = useState<GameState>({
    continent: null,
    category: null,
    level: 1,
    queue: [],
    qIndex: 0,
    score: 0,
    questionsAnswered: 0,
    totalQuestions: 0,
    startedAt: 0,
    endedAt: null,
  });
  const [showResult, setShowResult] = useState(false);
  const [submission, setSubmission] = useState<
    | { ok: true; data: import("./hooks/useScores").ScoreSubmissionResult }
    | { ok: false; error: string }
    | null
  >(null);
  const [leaderboard, setLeaderboard] = useState<
    | { ok: true; data: import("./hooks/useScores").LeaderboardResult }
    | { ok: false; error: string }
    | null
  >(null);

  const selectContinent = useCallback((c: Continent) => {
    setGameState((prev) => ({ ...prev, continent: c }));
    const gradients: Record<Continent, string> = {
      Africa: "radial-gradient(circle at bottom, #D2691E 0%, transparent 70%)",
      Asia: "radial-gradient(circle at bottom, #DC143C 0%, transparent 70%)",
      Europe: "radial-gradient(circle at bottom, #4169E1 0%, transparent 70%)",
      Americas:
        "radial-gradient(circle at bottom, #228B22 0%, transparent 70%)",
    };
    setBgGradient(gradients[c]);
    setScreen("categories");
  }, []);

  const loadLevel = useCallback(
    (continent: Continent, category: Category, level: number) => {
      const questions = getQuestionsForLevel(continent, category, level);
      const queue: QueueItem[] = questions.map((q) => ({
        type: "question" as const,
        data: q,
      }));

      const factBase = FACTS[continent] || FACTS["Africa"];
      const fIndex = (level - 1) * 2;
      queue.push({
        type: "fact",
        text: factBase[fIndex % factBase.length],
      });
      queue.push({
        type: "fact",
        text: factBase[(fIndex + 1) % factBase.length],
      });

      setGameState({
        continent,
        category,
        level,
        queue: shuffle(queue),
        qIndex: 0,
        score: 0,
        questionsAnswered: 0,
        totalQuestions: questions.length, // excludes fact cards
        startedAt: Date.now(),
        endedAt: null,
      });
      setShowResult(false);
      setSubmission(null);
      setLeaderboard(null);
      play("start");
      setScreen("game");
    },
    [play],
  );

  const startGame = useCallback(
    (category: Category) => {
      if (!gameState.continent) return;
      // Pick the highest unlocked level for this track, defaulting to 1
      const highest = progress.highestUnlockedLevel(
        gameState.continent,
        category,
      );
      loadLevel(gameState.continent, category, highest);
    },
    [gameState.continent, loadLevel, progress],
  );

  const handleAnswer = useCallback((selected: string, correct: string) => {
    setGameState((prev) => {
      const isCorrect = selected === correct;
      const newScore = isCorrect ? prev.score + 1 : prev.score;
      const newQuestionsAnswered = prev.questionsAnswered + 1;
      const nextIndex = prev.qIndex + 1;
      if (nextIndex >= prev.queue.length) {
        const endedState = {
          ...prev,
          score: newScore,
          questionsAnswered: newQuestionsAnswered,
          qIndex: nextIndex,
          endedAt: Date.now(),
        };
        setTimeout(() => setShowResult(true), 100);
        return endedState;
      }
      return {
        ...prev,
        score: newScore,
        questionsAnswered: newQuestionsAnswered,
        qIndex: nextIndex,
      };
    });
  }, []);

  // Fact cards ("Did you know?") are random fun facts — they do NOT count
  // toward the score or the question count. They just advance the queue.
  const handleFactContinue = useCallback(() => {
    setGameState((prev) => {
      const nextIndex = prev.qIndex + 1;
      if (nextIndex >= prev.queue.length) {
        const endedState = {
          ...prev,
          qIndex: nextIndex,
          endedAt: Date.now(),
        };
        setTimeout(() => setShowResult(true), 100);
        return endedState;
      }
      return { ...prev, qIndex: nextIndex };
    });
  }, []);

  const handleExit = useCallback(() => {
    setShowResult(false);
    setScreen("levels");
  }, []);

  const handleSetName = useCallback(
    (raw: string): { ok: true } | { ok: false; error: string } => {
      if (raw === "") {
        clearName();
        return { ok: true };
      }
      return setName(raw);
    },
    [setName, clearName],
  );

  // Submit score + fetch leaderboard when result modal shows
  useEffect(() => {
    if (!showResult) return;
    if (
      !playerName ||
      !gameState.continent ||
      !gameState.category ||
      !gameState.endedAt
    )
      return;

    const total = gameState.totalQuestions; // excludes fact cards
    const passed = gameState.score >= PASS_THRESHOLD;
    const timeMs = gameState.endedAt - gameState.startedAt;

    // Record locally (for unlock + best-score tracking)
    const wasNewBest = progress.recordScore({
      continent: gameState.continent,
      category: gameState.category,
      level: gameState.level,
      score: gameState.score,
      total,
      passed,
    });
    if (wasNewBest) play("achievement");

    // Submit to backend
    const c = gameState.continent;
    const cat = gameState.category;
    if (!c || !cat) return;
    void (async () => {
      const result = await submitScore({
        name: playerName,
        continent: c,
        category: cat,
        level: gameState.level,
        score: gameState.score,
        total,
        timeMs,
        passed,
      });
      setSubmission(result);

      // Fetch leaderboard for this track (regardless of submit success)
      const lb = await fetchLeaderboard({
        continent: c,
        category: cat,
        level: gameState.level,
        limit: 10,
      });
      setLeaderboard(lb);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showResult]);

  // ---- Progress helpers passed to child screens ----
  const getContinentProgress = useCallback(
    (c: Continent) => {
      let started = 0;
      let completed = 0;
      for (const cat of [
        "Countries",
        "Presidents",
        "Flags",
        "Currencies",
      ] as Category[]) {
        if (progress.levelsPassed(c, cat) > 0) started++;
        if (progress.levelsPassed(c, cat) === 3) completed++;
      }
      return { started, completed };
    },
    [progress],
  );

  const getCategoryProgress = useCallback(
    (cat: Category) => {
      const c = gameState.continent;
      if (!c)
        return { levelsPassed: 0, bestScore: null as number | null, total: 10 };
      const levelsPassed = progress.levelsPassed(c, cat);
      // Find best score across all 3 levels
      let bestScore: number | null = null;
      let total = 10;
      for (const lvl of [1, 2, 3]) {
        const rec = progress.getBest(c, cat, lvl);
        if (rec && (bestScore === null || rec.bestScore > bestScore)) {
          bestScore = rec.bestScore;
          total = rec.total;
        }
      }
      return { levelsPassed, bestScore, total };
    },
    [progress, gameState.continent],
  );

  const getLevelInfo = useCallback(
    (level: number) => {
      const c = gameState.continent;
      const cat = gameState.category;
      if (!c || !cat)
        return {
          unlocked: level === 1,
          bestScore: null as number | null,
          total: 10,
          passed: false,
        };
      const rec = progress.getBest(c, cat, level);
      return {
        unlocked: progress.isLevelUnlocked(c, cat, level),
        bestScore: rec?.bestScore ?? null,
        total: rec?.total ?? 10,
        passed: rec?.passed ?? false,
      };
    },
    [progress, gameState.continent, gameState.category],
  );

  if (!hydrated) {
    return (
      <div className="app-container">
        <div
          className="screen screen-home"
          style={{ textAlign: "center", paddingTop: 80 }}
        >
          Loading...
        </div>
      </div>
    );
  }

  const effectiveScreen: Screen = !playerName ? "home" : screen;

  return (
    <>
      <div className="app-bg" style={{ backgroundImage: bgGradient }} />
      <div className="app-container">
        <MuteButton muted={muted} onToggle={toggleMute} />
        {effectiveScreen === "home" && (
          <HomeScreen
            playerName={playerName}
            onSetName={handleSetName}
            onStart={() => setScreen("continents")}
            onShowLeaderboard={() => setScreen("leaderboard")}
            tracksCompleted={progress.tracksCompleted()}
            tracksStarted={progress.tracksStarted()}
            play={play}
          />
        )}
        {effectiveScreen === "continents" && playerName && (
          <ContinentScreen
            playerName={playerName}
            onSelect={selectContinent}
            onBack={() => {
              setBgGradient("none");
              setScreen("home");
            }}
            play={play}
            getContinentProgress={getContinentProgress}
          />
        )}
        {effectiveScreen === "categories" &&
          gameState.continent &&
          playerName && (
            <CategoryScreen
              playerName={playerName}
              continent={gameState.continent}
              onSelect={(cat) => {
                setGameState((prev) => ({ ...prev, category: cat }));
                setScreen("levels");
              }}
              onBack={() => setScreen("continents")}
              play={play}
              getCategoryProgress={getCategoryProgress}
            />
          )}
        {effectiveScreen === "levels" &&
          gameState.continent &&
          gameState.category &&
          playerName && (
            <LevelScreen
              playerName={playerName}
              continent={gameState.continent}
              category={gameState.category}
              onSelect={(lvl) => {
                if (gameState.continent && gameState.category) {
                  loadLevel(gameState.continent, gameState.category, lvl);
                }
              }}
              onBack={() => setScreen("categories")}
              play={play}
              getLevelInfo={getLevelInfo}
            />
          )}
        {effectiveScreen === "game" && (
          <GameScreen
            state={gameState}
            playerName={playerName ?? ""}
            onAnswer={handleAnswer}
            onFactContinue={handleFactContinue}
            onExit={handleExit}
            play={play}
          />
        )}
        {effectiveScreen === "leaderboard" && (
          <LeaderboardScreen
            onBack={() => setScreen("home")}
            fetchLeaderboard={fetchLeaderboard}
            play={play}
          />
        )}
      </div>

      {showResult && (
        <ResultModal
          state={gameState}
          playerName={playerName ?? ""}
          submission={submission}
          leaderboard={leaderboard}
          play={play}
          onNextLevel={() => {
            if (gameState.continent && gameState.category) {
              loadLevel(
                gameState.continent,
                gameState.category,
                gameState.level + 1,
              );
            }
          }}
          onRetry={() => {
            if (gameState.continent && gameState.category) {
              loadLevel(
                gameState.continent,
                gameState.category,
                gameState.level,
              );
            }
          }}
          onReplay={() => {
            if (gameState.continent && gameState.category) {
              loadLevel(gameState.continent, gameState.category, 1);
            }
          }}
          onHome={() => {
            setShowResult(false);
            setScreen("levels");
          }}
          onShowLeaderboard={() => {
            setShowResult(false);
            setScreen("leaderboard");
          }}
        />
      )}
    </>
  );
}

export default App;
