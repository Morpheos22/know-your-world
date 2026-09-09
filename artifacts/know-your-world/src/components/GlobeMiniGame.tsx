/**
 * GlobeMiniGame — hold the globe 3+ seconds to trigger a burst mini-game.
 *
 * Flow:
 *   1. Player holds (mousedown/touchstart) the globe for 3+ seconds
 *   2. Globe swells up with a pulsing animation
 *   3. Globe bursts into N tiny globes that scatter around the screen
 *   4. Player swipes a tiny globe to hit other tiny globes (arcade physics)
 *   5. When a tiny globe is hit 3 times, it glows and returns to center
 *   6. Morpheos voice triggers on globe return with random sayings:
 *      WOW, GREAT, SUPERSTAR, SHINOBI, MATCHPOINT, SHOWOFF
 *   7. When all tiny globes return to center, the original globe is restored
 *
 * Arcade physics: instant direction change, no friction (balls keep moving),
 * bounce off screen edges. This is intentionally simple — kids game.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

const HOLD_DURATION_MS = 3000; // 3 seconds to trigger burst
const TINY_GLOBE_COUNT = 6;
const HIT_THRESHOLD = 3; // hits before a globe returns to center
const GLOBE_SIZE = 40; // px, tiny globe size
const SWIPE_FORCE = 8; // velocity multiplier for swipe
const EDGE_BOUNCE = 0.9; // velocity retained on wall bounce

interface TinyGlobe {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hits: number;
  returning: boolean;
  returned: boolean;
}

const MORPHEOS_SAYINGS = [
  "WOW!",
  "GREAT!",
  "SUPERSTAR!",
  "SHINOBI!",
  "MATCH POINT!",
  "SHOWOFF!",
];

interface GlobeMiniGameProps {
  /** Called when Morpheos should speak a saying (handled by parent) */
  onGlobeReturn: (saying: string) => void;
  /** Whether the mini-game is active (shown) */
  active: boolean;
  /** Called when the mini-game is dismissed */
  onClose: () => void;
}

export function GlobeMiniGame({
  onGlobeReturn,
  active,
  onClose,
}: GlobeMiniGameProps) {
  const [phase, setPhase] = useState<
    "holding" | "swelling" | "bursting" | "playing" | "complete"
  >("holding");
  const [holdProgress, setHoldProgress] = useState(0); // 0..1
  const [globes, setGlobes] = useState<TinyGlobe[]>([]);
  const [selectedGlobe, setSelectedGlobe] = useState<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const swellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const swipeStartRef = useRef<{ x: number; y: number; id: number } | null>(
    null,
  );

  // ---- Hold detection ----
  const startHold = useCallback(() => {
    if (phase !== "holding") return;
    const startTime = Date.now();
    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / HOLD_DURATION_MS, 1);
      setHoldProgress(progress);
      if (progress >= 1) {
        if (holdTimerRef.current) clearInterval(holdTimerRef.current);
        setPhase("swelling");
        // After swell animation, burst
        swellTimerRef.current = setTimeout(() => {
          burstGlobes();
        }, 800); // 800ms swell animation
      }
    }, 50);
  }, [phase]);

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (swellTimerRef.current) {
      clearTimeout(swellTimerRef.current);
      swellTimerRef.current = null;
    }
    if (phase === "holding") {
      setHoldProgress(0);
    }
  }, [phase]);

  // ---- Burst into tiny globes ----
  const burstGlobes = useCallback(() => {
    setPhase("bursting");
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const newGlobes: TinyGlobe[] = [];
    for (let i = 0; i < TINY_GLOBE_COUNT; i++) {
      const angle = (i / TINY_GLOBE_COUNT) * Math.PI * 2;
      const speed = 3 + Math.random() * 2;
      newGlobes.push({
        id: i,
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        hits: 0,
        returning: false,
        returned: false,
      });
    }
    setGlobes(newGlobes);
    setPhase("playing");
  }, []);

  // ---- Physics animation loop ----
  useEffect(() => {
    if (phase !== "playing") return;
    const container = containerRef.current;
    if (!container) return;

    const animate = () => {
      const rect = container.getBoundingClientRect();
      setGlobes((prev) =>
        prev.map((g) => {
          if (g.returned) return g;

          // If returning to center, move toward center
          if (g.returning) {
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const dx = cx - g.x;
            const dy = cy - g.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 5) {
              // Arrived at center
              if (!g.returned) {
                // Trigger Morpheos voice
                const saying =
                  MORPHEOS_SAYINGS[
                    Math.floor(Math.random() * MORPHEOS_SAYINGS.length)
                  ];
                onGlobeReturn(saying);
              }
              return { ...g, returned: true, vx: 0, vy: 0, x: cx, y: cy };
            }
            const speed = 4;
            return {
              ...g,
              x: g.x + (dx / dist) * speed,
              y: g.y + (dy / dist) * speed,
            };
          }

          // Normal physics: move + bounce off walls
          let newX = g.x + g.vx;
          let newY = g.y + g.vy;
          let newVx = g.vx;
          let newVy = g.vy;

          if (newX < GLOBE_SIZE / 2) {
            newX = GLOBE_SIZE / 2;
            newVx = Math.abs(newVx) * EDGE_BOUNCE;
          } else if (newX > rect.width - GLOBE_SIZE / 2) {
            newX = rect.width - GLOBE_SIZE / 2;
            newVx = -Math.abs(newVx) * EDGE_BOUNCE;
          }

          if (newY < GLOBE_SIZE / 2) {
            newY = GLOBE_SIZE / 2;
            newVy = Math.abs(newVy) * EDGE_BOUNCE;
          } else if (newY > rect.height - GLOBE_SIZE / 2) {
            newY = rect.height - GLOBE_SIZE / 2;
            newVy = -Math.abs(newVy) * EDGE_BOUNCE;
          }

          return { ...g, x: newX, y: newY, vx: newVx, vy: newVy };
        }),
      );

      // Check if all globes have returned
      setGlobes((prev) => {
        if (prev.length > 0 && prev.every((g) => g.returned)) {
          setPhase("complete");
          setTimeout(() => {
            onClose();
          }, 1500);
        }
        return prev;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [phase, onGlobeReturn, onClose]);

  // ---- Collision detection (check after position update) ----
  useEffect(() => {
    if (phase !== "playing" || globes.length === 0) return;

    // Check collisions between globes
    const collisions: { a: number; b: number }[] = [];
    for (let i = 0; i < globes.length; i++) {
      for (let j = i + 1; j < globes.length; j++) {
        const a = globes[i];
        const b = globes[j];
        if (a.returned || b.returned || a.returning || b.returning) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < GLOBE_SIZE) {
          collisions.push({ a: i, b: j });
        }
      }
    }

    if (collisions.length > 0) {
      setGlobes((prev) => {
        const next = [...prev];
        for (const { a, b } of collisions) {
          const ga = next[a];
          const gb = next[b];
          if (!ga || !gb) continue;

          // Swap velocities (simple elastic collision)
          const tmpVx = ga.vx;
          const tmpVy = ga.vy;
          ga.vx = gb.vx;
          ga.vy = gb.vy;
          gb.vx = tmpVx;
          gb.vy = tmpVy;

          // Increment hit counts
          ga.hits += 1;
          gb.hits += 1;

          // Check if hit threshold reached
          if (ga.hits >= HIT_THRESHOLD && !ga.returning) {
            ga.returning = true;
          }
          if (gb.hits >= HIT_THRESHOLD && !gb.returning) {
            gb.returning = true;
          }
        }
        return next;
      });
    }
  }, [globes, phase]);

  // ---- Swipe handling (launch a globe) ----
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent, globeId: number) => {
      if (phase !== "playing") return;
      const g = globes.find((g) => g.id === globeId);
      if (!g || g.returned || g.returning) return;
      swipeStartRef.current = { x: e.clientX, y: e.clientY, id: globeId };
      setSelectedGlobe(globeId);
    },
    [globes, phase],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (!swipeStartRef.current || phase !== "playing") return;
      const dx = e.clientX - swipeStartRef.current.x;
      const dy = e.clientY - swipeStartRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 10) {
        // Launch the globe in the swipe direction
        const id = swipeStartRef.current.id;
        setGlobes((prev) =>
          prev.map((g) =>
            g.id === id
              ? {
                  ...g,
                  vx: (dx / dist) * SWIPE_FORCE,
                  vy: (dy / dist) * SWIPE_FORCE,
                }
              : g,
          ),
        );
      }
      swipeStartRef.current = null;
      setSelectedGlobe(null);
    },
    [phase],
  );

  // ---- Cleanup on unmount ----
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
      if (swellTimerRef.current) clearTimeout(swellTimerRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  if (!active) return null;

  return (
    <div
      className="globe-minigame-overlay"
      ref={containerRef}
      onPointerUp={handlePointerUp}
    >
      {phase === "holding" && (
        <div
          className="globe-hold-target"
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
        >
          <div
            className="globe-hold-orb"
            style={{ transform: `scale(${1 + holdProgress * 0.3})` }}
          >
            <div className="globe-surface" />
            <div className="globe-shine" />
            <div className="globe-glow" />
          </div>
          <div className="globe-hold-text">
            {holdProgress > 0 ? "Keep holding..." : "Hold to play!"}
          </div>
          {holdProgress > 0 && (
            <div className="globe-hold-bar">
              <div
                className="globe-hold-bar-fill"
                style={{ width: `${holdProgress * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {phase === "swelling" && (
        <div className="globe-swelling">
          <div className="globe-hold-orb globe-swell-anim">
            <div className="globe-surface" />
            <div className="globe-shine" />
          </div>
        </div>
      )}

      {(phase === "bursting" ||
        phase === "playing" ||
        phase === "complete") && (
        <>
          {globes.map((g) => (
            <div
              key={g.id}
              className={`globe-tiny${g.returning ? " globe-tiny-returning" : ""}${g.returned ? " globe-tiny-returned" : ""}${selectedGlobe === g.id ? " globe-tiny-selected" : ""}`}
              style={{
                left: `${g.x - GLOBE_SIZE / 2}px`,
                top: `${g.y - GLOBE_SIZE / 2}px`,
                width: `${GLOBE_SIZE}px`,
                height: `${GLOBE_SIZE}px`,
              }}
              onPointerDown={(e) => handlePointerDown(e, g.id)}
            >
              <div className="globe-tiny-orb">
                <div className="globe-surface" />
                <div className="globe-shine" />
              </div>
              {g.hits > 0 && !g.returned && (
                <div className="globe-tiny-hits">{g.hits}</div>
              )}
            </div>
          ))}
          {phase === "playing" && (
            <div className="globe-minigame-hint">
              Swipe a globe to launch it! Hit others 3 times to return them.
            </div>
          )}
          {phase === "complete" && (
            <div className="globe-minigame-complete">
              All globes returned! 🎉
            </div>
          )}
          <button className="globe-minigame-close" onClick={onClose}>
            ✕
          </button>
        </>
      )}
    </div>
  );
}
