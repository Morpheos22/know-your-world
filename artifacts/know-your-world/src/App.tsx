import { useState, useCallback, useRef, useEffect } from "react";
import type { Screen, Continent, Category, GameState, QueueItem } from "./data/types";
import { getQuestionsForLevel } from "./data";
import { FACTS } from "./data/facts";

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

function HomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="screen screen-home">
      <div className="title-text">Know Your World</div>
      <div className="subtitle">V2 | World Edition</div>
      <Globe />
      <p style={{ fontSize: "0.8rem", color: "#888", marginTop: 10 }}>
        (Tap globe to interact)
      </p>
      <div style={{ marginTop: 40 }}>
        <button className="menu-btn" onClick={onStart}>
          START GAME
        </button>
      </div>
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

const CONTINENTS: { name: Continent; icon: string }[] = [
  { name: "Africa", icon: "\uD83C\uDF0D" },
  { name: "Asia", icon: "\u26E9\uFE0F" },
  { name: "Europe", icon: "\uD83C\uDFF0" },
  { name: "Americas", icon: "\uD83D\uDDFD" },
];

function ContinentScreen({
  onSelect,
  onBack,
}: {
  onSelect: (c: Continent) => void;
  onBack: () => void;
}) {
  return (
    <>
      <div className="header">
        <button className="back-btn" onClick={onBack}>
          {"\u2B05\uFE0F"}
        </button>
        <h2>Select Continent</h2>
        <div style={{ width: 24 }} />
      </div>
      <div className="screen">
        <div className="grid">
          {CONTINENTS.map((c) => (
            <div className="tile" key={c.name} onClick={() => onSelect(c.name)}>
              <span className="tile-icon">{c.icon}</span>
              <h3>{c.name}</h3>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const CATEGORIES: { name: Category; icon: string; label: string }[] = [
  { name: "Countries", icon: "\uD83D\uDDFA\uFE0F", label: "Countries & Capitals" },
  { name: "Presidents", icon: "\uD83D\uDC68\u200D\u2696\uFE0F", label: "Presidents / Leaders" },
  { name: "Flags", icon: "\uD83C\uDFF3\uFE0F", label: "Flags" },
  { name: "Currencies", icon: "\uD83D\uDCB0", label: "Currencies" },
];

function CategoryScreen({
  continent,
  onSelect,
  onBack,
}: {
  continent: Continent;
  onSelect: (cat: Category) => void;
  onBack: () => void;
}) {
  return (
    <>
      <div className="header">
        <button className="back-btn" onClick={onBack}>
          {"\u2B05\uFE0F"}
        </button>
        <h2>{continent}</h2>
        <div style={{ width: 24 }} />
      </div>
      <div className="screen">
        <div style={{ padding: "20px 0", textAlign: "center", color: "var(--primary-dark)" }}>
          <h3>Select Category</h3>
        </div>
        <div className="grid">
          {CATEGORIES.map((cat) => (
            <div className="tile" key={cat.name} onClick={() => onSelect(cat.name)}>
              <span className="tile-icon">{cat.icon}</span>
              <h3>{cat.label}</h3>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function GameScreen({
  state,
  onAnswer,
  onFactContinue,
  onExit,
}: {
  state: GameState;
  onAnswer: (selected: string, correct: string) => void;
  onFactContinue: () => void;
  onExit: () => void;
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
    setTimeout(() => {
      onAnswer(opt, item.data!.a);
    }, 1000);
  };

  const correctAnswer = item.data?.a;

  return (
    <>
      <div className="header">
        <button className="back-btn" onClick={onExit}>
          {"\u2716\uFE0F"}
        </button>
        <h2>Level {state.level}</h2>
        <div className="score-box">
          {state.score}/10
        </div>
      </div>
      <div className="screen">
        <div style={{ padding: "10px 0" }}>
          <div className="level-badge">LEVEL {state.level}</div>
          <div className={`question-card${item.type === "fact" ? " fact-card" : ""}`}>
            {item.type === "fact" ? (
              <>
                <div className="fact-label">{"\uD83D\uDCA1"} DID YOU KNOW?</div>
                <div className="q-text">{item.text}</div>
                <div className="options-list">
                  <button
                    className="opt-btn"
                    style={{ textAlign: "center", fontWeight: "bold" }}
                    onClick={onFactContinue}
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

function ResultModal({
  state,
  onNextLevel,
  onRetry,
  onReplay,
  onHome,
}: {
  state: GameState;
  onNextLevel: () => void;
  onRetry: () => void;
  onReplay: () => void;
  onHome: () => void;
}) {
  const passed = state.score >= 5;

  useEffect(() => {
    if (passed) triggerConfetti();
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
          onClick={
            !passed ? onRetry : state.level === 3 ? onReplay : onNextLevel
          }
        >
          {!passed
            ? "Try Level Again"
            : state.level === 3
            ? "Replay Category"
            : `Go to Level ${state.level + 1}`}
        </button>
        <button className="modal-home-btn" onClick={onHome}>
          Back to Menu
        </button>
      </div>
    </div>
  );
}

function App() {
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
      Americas: "radial-gradient(circle at bottom, #228B22 0%, transparent 70%)",
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
      setScreen("game");
    },
    []
  );

  const startGame = useCallback(
    (category: Category) => {
      if (!gameState.continent) return;
      loadLevel(gameState.continent, category, 1);
    },
    [gameState.continent, loadLevel]
  );

  const handleAnswer = useCallback(
    (selected: string, correct: string) => {
      setGameState((prev) => {
        const newScore = selected === correct ? prev.score + 1 : prev.score;
        const nextIndex = prev.qIndex + 1;
        if (nextIndex >= prev.queue.length) {
          setTimeout(() => setShowResult(true), 100);
          return { ...prev, score: newScore, qIndex: nextIndex };
        }
        return { ...prev, score: newScore, qIndex: nextIndex };
      });
    },
    []
  );

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

  return (
    <>
      <div className="app-bg" style={{ backgroundImage: bgGradient }} />
      <div className="app-container">
        {screen === "home" && (
          <HomeScreen onStart={() => setScreen("continents")} />
        )}
        {screen === "continents" && (
          <ContinentScreen
            onSelect={selectContinent}
            onBack={() => {
              setBgGradient("none");
              setScreen("home");
            }}
          />
        )}
        {screen === "categories" && gameState.continent && (
          <CategoryScreen
            continent={gameState.continent}
            onSelect={startGame}
            onBack={() => setScreen("continents")}
          />
        )}
        {screen === "game" && (
          <GameScreen
            state={gameState}
            onAnswer={handleAnswer}
            onFactContinue={handleFactContinue}
            onExit={handleExit}
          />
        )}
      </div>

      {showResult && (
        <ResultModal
          state={gameState}
          onNextLevel={() => {
            if (gameState.continent && gameState.category) {
              loadLevel(
                gameState.continent,
                gameState.category,
                gameState.level + 1
              );
            }
          }}
          onRetry={() => {
            if (gameState.continent && gameState.category) {
              loadLevel(
                gameState.continent,
                gameState.category,
                gameState.level
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
