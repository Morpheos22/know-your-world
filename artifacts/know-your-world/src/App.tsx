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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function triggerConfetti() {
  for (let i = 0; i < 30; i++) {
    const c = document.createElement("div");
    c.className = "confetti";
    c.style.left = Math.random() * 100 + "%";
    c.style.top = "-10px";
    c.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
    c.style.animationDuration = Math.random() * 2 + 1 + "s";
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3000);
  }
}

// ============================================================================
// Level metadata — relational to user's progress
// ============================================================================

const LEVEL_META: Record<number, { label: string; color: string }> = {
  1: { label: "Easy", color: "var(--success)" },
  2: { label: "Medium", color: "#E0A526" },
  3: { label: "Hard", color: "var(--error)" },
};

// ============================================================================
// Mute toggle button — floats in top-right of every screen
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
  play,
}: {
  playerName: string | null;
  onSetName: (raw: string) => { ok: true } | { ok: false; error: string };
  onStart: () => void;
  play: (s: SoundName) => void;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input on mount if no name is set
  useEffect(() => {
    if (!playerName && inputRef.current) {
      inputRef.current.focus();
    }
  }, [playerName]);

  const handleStart = useCallback(() => {
    // If we already have a stored name, start immediately
    if (playerName) {
      play("click");
      onStart();
      return;
    }
    // Otherwise, validate the input first
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
          />
          {error && <div className="name-error">{error}</div>}
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
          <div style={{ marginTop: 24 }}>
            <button className="menu-btn" onClick={handleStart}>
              START GAME
            </button>
          </div>
          <button
            className="not-me-btn"
            onClick={() => {
              play("click");
              onSetName(""); // clear
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
// Continent Selection
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
}: {
  playerName: string;
  onSelect: (c: Continent) => void;
  onBack: () => void;
  play: (s: SoundName) => void;
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
        >
          {"\u2B05\uFE0F"}
        </button>
        <h2>Select Continent</h2>
        <div style={{ width: 24 }} />
      </div>
      <div className="breadcrumb">Player: {playerName}</div>
      <div className="screen">
        <div className="grid">
          {CONTINENTS.map((c) => (
            <div
              className="tile"
              key={c.name}
              onClick={() => {
                play("click");
                onSelect(c.name);
              }}
            >
              <span className="tile-icon">{c.icon}</span>
              <h3>{c.name}</h3>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Category Selection
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
}: {
  playerName: string;
  continent: Continent;
  onSelect: (cat: Category) => void;
  onBack: () => void;
  play: (s: SoundName) => void;
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
          {CATEGORIES.map((cat) => (
            <div
              className="tile"
              key={cat.name}
              onClick={() => {
                play("click");
                onSelect(cat.name);
              }}
            >
              <span className="tile-icon">{cat.icon}</span>
              <h3>{cat.label}</h3>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Game Screen — with the 4-quadrant relational HUD
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
  const [shuffledOpts, setShuffledOpts] = useState<string[]>([]);
  const item = state.queue[state.qIndex];

  useEffect(() => {
    setSelected(null);
    setDisabled(false);
    if (item?.type === "question" && item.data) {
      setShuffledOpts(shuffle(item.data.opts));
    }
  }, [state.qIndex, item]);

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
  const totalQuestions = state.queue.length;
  const currentQuestionNum = state.qIndex + 1; // 1-indexed
  const questionsRemaining = totalQuestions - state.qIndex; // includes current
  const maxPossibleScore = state.score + questionsRemaining; // if all remaining correct
  const levelMeta = LEVEL_META[state.level] ?? LEVEL_META[1];
  const questionProgressPct = (state.qIndex / totalQuestions) * 100;
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
            onExit();
          }}
        >
          {"\u2716\uFE0F"}
        </button>
        <h2>Level {state.level}</h2>
        <div style={{ width: 24 }} />
      </div>

      {/* ---- 4-quadrant relational HUD ---- */}
      <div className="hud">
        <div className="hud-row">
          <div className="hud-cell hud-cell-tl">
            <div className="hud-label">Player</div>
            <div className="hud-value">
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
              Question {currentQuestionNum} of {totalQuestions}
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
              Can still reach {maxPossibleScore}/{totalQuestions}
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
    </>
  );
}

// ============================================================================
// Result Modal — with SFX on pass/fail
// ============================================================================

function ResultModal({
  state,
  onNextLevel,
  onRetry,
  onReplay,
  onHome,
  play,
}: {
  state: GameState;
  onNextLevel: () => void;
  onRetry: () => void;
  onReplay: () => void;
  onHome: () => void;
  play: (s: SoundName) => void;
}) {
  const passed = state.score >= 5;

  useEffect(() => {
    if (passed) {
      play("levelPassed");
      triggerConfetti();
    } else {
      play("levelFailed");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passed]);

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
        <p>You scored {state.score}/10</p>

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
// App root
// ============================================================================

function App() {
  const { name: playerName, hydrated, setName, clearName } = usePlayer();
  const { play, muted, toggleMute } = useSfx();
  const [screen, setScreen] = useState<Screen>("home");
  const [bgGradient, setBgGradient] = useState("none");
  const [gameState, setGameState] = useState<GameState>({
    continent: null,
    category: null,
    level: 1,
    queue: [],
    qIndex: 0,
    score: 0,
  });
  const [showResult, setShowResult] = useState(false);

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
      });
      setShowResult(false);
      play("start");
      setScreen("game");
    },
    [play],
  );

  const startGame = useCallback(
    (category: Category) => {
      if (!gameState.continent) return;
      loadLevel(gameState.continent, category, 1);
    },
    [gameState.continent, loadLevel],
  );

  const handleAnswer = useCallback((selected: string, correct: string) => {
    setGameState((prev) => {
      const newScore = selected === correct ? prev.score + 1 : prev.score;
      const nextIndex = prev.qIndex + 1;
      if (nextIndex >= prev.queue.length) {
        setTimeout(() => setShowResult(true), 100);
        return { ...prev, score: newScore, qIndex: nextIndex };
      }
      return { ...prev, score: newScore, qIndex: nextIndex };
    });
  }, []);

  const handleFactContinue = useCallback(() => {
    setGameState((prev) => {
      const newScore = prev.score + 1;
      const nextIndex = prev.qIndex + 1;
      if (nextIndex >= prev.queue.length) {
        setTimeout(() => setShowResult(true), 100);
        return { ...prev, score: newScore, qIndex: nextIndex };
      }
      return { ...prev, score: newScore, qIndex: nextIndex };
    });
  }, []);

  const handleExit = useCallback(() => {
    if (window.confirm("Quit current game?")) {
      setShowResult(false);
      setScreen("categories");
    }
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

  // Don't render until player hook hydrates (avoids name input flash)
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

  // Gate the game flow behind a name — if no name, force home screen
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
          />
        )}
        {effectiveScreen === "categories" &&
          gameState.continent &&
          playerName && (
            <CategoryScreen
              playerName={playerName}
              continent={gameState.continent}
              onSelect={startGame}
              onBack={() => setScreen("continents")}
              play={play}
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
      </div>

      {showResult && (
        <ResultModal
          state={gameState}
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
            setScreen("continents");
          }}
        />
      )}
    </>
  );
}

export default App;
