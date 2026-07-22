import React, { useState, useEffect, useRef, useCallback } from "react";

// Scripted code lines for the hero CRDT live demo
const HERO_DEMO_SCRIPT = [
  { line: 1, text: "function invertTree(root) {", role: "candidate" },
  { line: 2, text: "  if (!root) return null;", role: "candidate" },
  { line: 3, text: "  const left = invertTree(root.left);", role: "candidate" },
  { line: 4, text: "  const right = invertTree(root.right);", role: "candidate" },
  { line: 5, text: "  root.left = right;", role: "candidate" },
  { line: 6, text: "  root.right = left;", role: "candidate" },
  { line: 7, text: "  return root;", role: "candidate" },
  { line: 8, text: "}", role: "candidate" },
  { line: 9, text: "// Verified O(N) space & time complexity", role: "interviewer" }
];

const MATRIX_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#$@%&*!?0123456789";

function LandingPage({ setAuthMode, setAuthForm }) {
  // ------------------------------------------------------------------
  // 1. Reduced Motion Preference
  // ------------------------------------------------------------------
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // ------------------------------------------------------------------
  // 2. Scroll Progress Bar
  // ------------------------------------------------------------------
  const [scrollProgress, setScrollProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      if (total > 0) {
        setScrollProgress((window.scrollY / total) * 100);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ------------------------------------------------------------------
  // 3. Parallax Grid & Radial Spotlight
  // ------------------------------------------------------------------
  const spotlightRef = useRef(null);
  const gridRef = useRef(null);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const currentPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (prefersReducedMotion || window.innerWidth < 768) return;

    let animId;
    const onMouseMove = (e) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const loop = () => {
      // Lerp 0.05
      currentPosRef.current.x += (mousePosRef.current.x - currentPosRef.current.x) * 0.05;
      currentPosRef.current.y += (mousePosRef.current.y - currentPosRef.current.y) * 0.05;

      if (spotlightRef.current) {
        spotlightRef.current.style.background = `radial-gradient(600px circle at ${currentPosRef.current.x}px ${currentPosRef.current.y}px, rgba(212, 101, 75, 0.07), transparent 75%)`;
      }
      if (gridRef.current) {
        const moveX = (currentPosRef.current.x / window.innerWidth - 0.5) * -12;
        const moveY = (currentPosRef.current.y / window.innerHeight - 0.5) * -12;
        gridRef.current.style.transform = `translate3d(${moveX}px, ${moveY}px, 0)`;
      }
      animId = requestAnimationFrame(loop);
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    animId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(animId);
    };
  }, [prefersReducedMotion]);

  // ------------------------------------------------------------------
  // 4. Hero Headline Glitch/Scramble Effect
  // ------------------------------------------------------------------
  const targetHeadline = "CLARITY UNDER PRESSURE";
  const [headlineDisplay, setHeadlineDisplay] = useState(targetHeadline);
  const [headlineSettled, setHeadlineSettled] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion) {
      setHeadlineSettled(true);
      return;
    }

    let frame = 0;
    const totalFrames = 12; // ~300ms at 60fps
    const interval = setInterval(() => {
      frame++;
      if (frame >= totalFrames) {
        clearInterval(interval);
        setHeadlineDisplay(targetHeadline);
        setHeadlineSettled(true);
      } else {
        const scrambled = targetHeadline
          .split("")
          .map((ch) => {
            if (ch === " ") return " ";
            return MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
          })
          .join("");
        setHeadlineDisplay(scrambled);
      }
    }, 25);

    return () => clearInterval(interval);
  }, [prefersReducedMotion]);

  // ------------------------------------------------------------------
  // 5. Scripted Editor CRDT Demo Loop (~12s)
  // ------------------------------------------------------------------
  const [demoLines, setDemoLines] = useState([]);
  const [candPos, setCandPos] = useState({ line: 1, col: 1 });
  const [interviewerPos, setInterviewerPos] = useState({ line: 1, col: 1 });
  const [isExecuting, setIsExecuting] = useState(false);
  const [testOutputVisible, setTestOutputVisible] = useState(false);
  const [treeSwapped, setTreeSwapped] = useState(false);
  const [demoFading, setDemoFading] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion) {
      // Render completed state statically
      setDemoLines(HERO_DEMO_SCRIPT.map(s => s.text));
      setCandPos({ line: 7, col: 15 });
      setInterviewerPos({ line: 9, col: 40 });
      setTestOutputVisible(true);
      setTreeSwapped(true);
      return;
    }

    let isMounted = true;
    let timeouts = [];

    const runScriptedDemo = () => {
      if (!isMounted) return;

      // Reset
      setDemoLines([]);
      setCandPos({ line: 1, col: 1 });
      setInterviewerPos({ line: 1, col: 1 });
      setIsExecuting(false);
      setTestOutputVisible(false);
      setTreeSwapped(false);
      setDemoFading(false);

      // Phase 1: Candidate types lines 1-8
      let cumulativeTime = 400;
      let currentLines = [""];

      HERO_DEMO_SCRIPT.slice(0, 8).forEach((item, lineIndex) => {
        const text = item.text;
        for (let i = 0; i <= text.length; i++) {
          const charTime = cumulativeTime + i * (55 + Math.floor(Math.random() * 35));
          const partialText = text.slice(0, i);

          const tId = setTimeout(() => {
            if (!isMounted) return;
            currentLines[lineIndex] = partialText;
            setDemoLines([...currentLines]);
            setCandPos({ line: lineIndex + 1, col: i + 1 });

            if (lineIndex < 7 && i === text.length) {
              currentLines.push("");
            }
          }, charTime);
          timeouts.push(tId);
        }
        cumulativeTime += text.length * 65 + 180;
      });

      // Phase 2: Interviewer drifts down to line 9 and types comment
      const interviewerStartTime = 2800;
      const interviewerItem = HERO_DEMO_SCRIPT[8];
      const commentText = interviewerItem.text;

      for (let i = 0; i <= commentText.length; i++) {
        const charTime = interviewerStartTime + i * 50;
        const partial = commentText.slice(0, i);

        const tId = setTimeout(() => {
          if (!isMounted) return;
          setInterviewerPos({ line: 9, col: i + 1 });
          setDemoLines((prev) => {
            const copy = [...prev];
            while (copy.length < 9) copy.push("");
            copy[8] = partial;
            return copy;
          });
        }, charTime);
        timeouts.push(tId);
      }

      // Phase 3: Execute code at ~6000ms
      const execTime = 6000;
      timeouts.push(
        setTimeout(() => {
          if (!isMounted) return;
          setIsExecuting(true);
        }, execTime)
      );

      // Phase 4: Test case output passes at ~6400ms
      const passTime = 6400;
      timeouts.push(
        setTimeout(() => {
          if (!isMounted) return;
          setIsExecuting(false);
          setTestOutputVisible(true);
        }, passTime)
      );

      // Phase 5: Tree inversion swap at ~6600ms
      const swapTime = 6600;
      timeouts.push(
        setTimeout(() => {
          if (!isMounted) return;
          setTreeSwapped(true);
        }, swapTime)
      );

      // Phase 6: Fade out demo at ~10800ms
      const fadeTime = 10800;
      timeouts.push(
        setTimeout(() => {
          if (!isMounted) return;
          setDemoFading(true);
        }, fadeTime)
      );

      // Loop restart at 12000ms
      const loopTime = 12000;
      timeouts.push(
        setTimeout(() => {
          if (!isMounted) return;
          runScriptedDemo();
        }, loopTime)
      );
    };

    runScriptedDemo();

    return () => {
      isMounted = false;
      timeouts.forEach(clearTimeout);
    };
  }, [prefersReducedMotion]);

  // ------------------------------------------------------------------
  // 6. IntersectionObserver for Spec Cards, Section Header Rules & Stats
  // ------------------------------------------------------------------
  const [cardsVisible, setCardsVisible] = useState(false);
  const [headerRuleVisible, setHeaderRuleVisible] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);

  const cardsRef = useRef(null);
  const headerRuleRef = useRef(null);
  const statsRef = useRef(null);

  useEffect(() => {
    const options = { threshold: 0.25 };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (entry.target === cardsRef.current) setCardsVisible(true);
          if (entry.target === headerRuleRef.current) setHeaderRuleVisible(true);
          if (entry.target === statsRef.current) setStatsVisible(true);
        }
      });
    }, options);

    if (cardsRef.current) observer.observe(cardsRef.current);
    if (headerRuleRef.current) observer.observe(headerRuleRef.current);
    if (statsRef.current) observer.observe(statsRef.current);

    return () => observer.disconnect();
  }, []);

  // ------------------------------------------------------------------
  // 7. Live Stat Counters (Count up + live session tick)
  // ------------------------------------------------------------------
  const [compileTimeVal, setCompileTimeVal] = useState(0);
  const [activeSessionsVal, setActiveSessionsVal] = useState(0);
  const [uptimeVal, setUptimeVal] = useState(0);

  useEffect(() => {
    if (!statsVisible) return;
    if (prefersReducedMotion) {
      setCompileTimeVal(0.8);
      setActiveSessionsVal(342);
      setUptimeVal(99.99);
      return;
    }

    let startTime;
    const duration = 1400; // ms

    const animateStats = (now) => {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);

      setCompileTimeVal(parseFloat((ease * 0.8).toFixed(1)));
      setActiveSessionsVal(Math.floor(ease * 342));
      setUptimeVal(parseFloat((ease * 99.99).toFixed(2)));

      if (progress < 1) {
        requestAnimationFrame(animateStats);
      }
    };

    const animId = requestAnimationFrame(animateStats);
    return () => cancelAnimationFrame(animId);
  }, [statsVisible, prefersReducedMotion]);

  // Live session ticker (ticks ±1 randomly every 4-9s)
  useEffect(() => {
    if (!statsVisible || prefersReducedMotion) return;

    let timerId;
    const scheduleTick = () => {
      const delay = 4000 + Math.random() * 5000;
      timerId = setTimeout(() => {
        setActiveSessionsVal((prev) => {
          const delta = Math.random() > 0.5 ? 1 : -1;
          return Math.max(300, prev + delta);
        });
        scheduleTick();
      }, delay);
    };

    scheduleTick();
    return () => clearTimeout(timerId);
  }, [statsVisible, prefersReducedMotion]);

  // ------------------------------------------------------------------
  // 8. Typewriter Console Output for Spec Cards on Hover
  // ------------------------------------------------------------------
  const [hoveredCard, setHoveredCard] = useState(null);
  const [card1Progress, setCard1Progress] = useState(100);
  const [card2Progress, setCard2Progress] = useState(100);
  const [card3Progress, setCard3Progress] = useState(100);

  const card1Full = "> connect_ws wss://interviewpad.io\n[OK] Socket connected.\n[OK] Delta synchronized: 4ms.";
  const card2Full = "> exec --lang node main.js\nExecuting constraints...\n[PASS] 54/54 Test Cases Successful.";
  const card3Full = "> toggle_feature --syntax false\n[OK] Syntax highlighting disabled.\n> toggle_feature --hints true\n[OK] Hint module activated.";

  useEffect(() => {
    if (hoveredCard === 1) {
      setCard1Progress(0);
      let p = 0;
      const interval = setInterval(() => {
        p += 2;
        setCard1Progress(p);
        if (p >= card1Full.length) clearInterval(interval);
      }, 25);
      return () => clearInterval(interval);
    } else {
      setCard1Progress(card1Full.length);
    }
  }, [hoveredCard, card1Full.length]);

  useEffect(() => {
    if (hoveredCard === 2) {
      setCard2Progress(0);
      let p = 0;
      const interval = setInterval(() => {
        p += 2;
        setCard2Progress(p);
        if (p >= card2Full.length) clearInterval(interval);
      }, 25);
      return () => clearInterval(interval);
    } else {
      setCard2Progress(card2Full.length);
    }
  }, [hoveredCard, card2Full.length]);

  useEffect(() => {
    if (hoveredCard === 3) {
      setCard3Progress(0);
      let p = 0;
      const interval = setInterval(() => {
        p += 2;
        setCard3Progress(p);
        if (p >= card3Full.length) clearInterval(interval);
      }, 25);
      return () => clearInterval(interval);
    } else {
      setCard3Progress(card3Full.length);
    }
  }, [hoveredCard, card3Full.length]);

  // ------------------------------------------------------------------
  // 9. CTA Button Loading State
  // ------------------------------------------------------------------
  const [ctaInitializing, setCtaInitializing] = useState(false);

  const handleInitClick = (e, mode = "login") => {
    e.preventDefault();
    setCtaInitializing(true);
    setTimeout(() => {
      setCtaInitializing(false);
      setAuthMode(mode);
    }, 450);
  };

  const handleNav = (e, mode, role) => {
    e.preventDefault();
    if (role && setAuthForm) {
      setAuthForm((prev) => ({ ...prev, role }));
    }
    setAuthMode(mode);
  };

  return (
    <div className="bp-landing">
      {/* Scroll Progress Bar */}
      <div
        className="bp-scroll-progress"
        style={{ width: `${scrollProgress}%` }}
        aria-hidden="true"
      />

      {/* Blueprint Grid Background with Parallax */}
      <div className="bp-grid" ref={gridRef} aria-hidden="true" />

      {/* Radial Cursor Spotlight */}
      <div className="bp-spotlight" ref={spotlightRef} aria-hidden="true" />

      <div className="bp-content">
        {/* 1. Observer Nav */}
        <nav className="bp-nav">
          <div className="bp-logo">InterviewPad</div>
          <div className="bp-nav-links">
            <a
              href="#"
              className="bp-nav-link"
              onClick={(e) => handleNav(e, "register", "interviewer")}
            >
              For Interviewers
            </a>
            <a
              href="#"
              className="bp-nav-link"
              onClick={(e) => handleNav(e, "register", "candidate")}
            >
              For Candidates
            </a>
            <button
              className={`bp-btn-init ${ctaInitializing ? "initializing" : ""}`}
              onClick={(e) => handleInitClick(e, "login")}
            >
              {ctaInitializing ? "> initializing..." : "Initialize Session"}
            </button>
          </div>
        </nav>

        {/* 2. Hero Section: Dual-Perspective Workspace */}
        <header className="bp-hero">
          {/* Per-character stagger reveal headline */}
          <h1 className="bp-heading bp-hero-title" aria-label={targetHeadline}>
            {targetHeadline.split("").map((char, idx) => (
              <span
                key={idx}
                className={`bp-hero-char ${headlineSettled ? "settled" : ""}`}
                style={{
                  animationDelay: `${idx * 25}ms`
                }}
              >
                {headlineSettled ? char : headlineDisplay[idx] || char}
              </span>
            ))}
          </h1>

          <p className="bp-hero-subtitle">
            The distraction-free collaborative environment built for rigorous technical interviews. Real-time sync, hidden test cases, and integrated compilers.
          </p>

          {/* Centerpiece Showcase: Live Dual-Perspective CRDT Editor Demo */}
          <div className={`bp-workspace-mockup ${demoFading ? "demo-fade" : ""}`}>
            {/* Left Pane: Interactive Binary Tree Visualizer */}
            <div className="bp-pane bp-pane-left">
              <div className="bp-pane-header">
                <span>Visualizer</span>
                <span className="bp-pane-badge">Binary Tree</span>
              </div>
              <div className="bp-pane-body">
                <div className="bp-tree-graph">
                  {/* Root Node 1 */}
                  <div className="bp-node bp-node-root">1</div>
                  
                  {/* Swappable Level 2 Nodes (2 and 3) */}
                  <div className="bp-tree-level">
                    <svg className="bp-tree-lines" viewBox="0 0 200 40">
                      <line x1="100" y1="0" x2="40" y2="40" className="bp-svg-edge" />
                      <line x1="100" y1="0" x2="160" y2="40" className="bp-svg-edge" />
                    </svg>

                    <div className={`bp-node bp-node-left ${treeSwapped ? "swapped-right" : ""}`}>
                      {treeSwapped ? "3" : "2"}
                    </div>
                    <div className={`bp-node bp-node-right ${treeSwapped ? "swapped-left" : ""}`}>
                      {treeSwapped ? "2" : "3"}
                    </div>
                  </div>
                </div>

                <div className="bp-problem-statement">
                  <span className="bp-accent-cyan">Task:</span> Invert a binary tree.<br />
                  Given the root of a binary tree, invert the tree, and return its root.<br /><br />
                  <span className="bp-accent-orange">Constraints:</span><br />
                  - The number of nodes is in the range [0, 100].<br />
                  - -100 &lt;= Node.val &lt;= 100
                </div>
              </div>
            </div>

            {/* Right Pane: Scripted CRDT Code Editor */}
            <div className="bp-pane bp-pane-right">
              <div className="bp-pane-header">
                <span>Editor</span>
                <div className="bp-editor-status">
                  {isExecuting ? (
                    <span className="bp-status-executing">Running Code...</span>
                  ) : (
                    <span>JavaScript (CRDT Synced)</span>
                  )}
                </div>
              </div>
              <div className="bp-pane-body bp-editor-body">
                {/* Render lines typed by CRDT demo */}
                {Array.from({ length: 9 }).map((_, lineIdx) => {
                  const lineNum = lineIdx + 1;
                  const lineContent = demoLines[lineIdx] || "";
                  const isCandLine = candPos.line === lineNum;
                  const isInterviewerLine = interviewerPos.line === lineNum;

                  return (
                    <div key={lineIdx} className="bp-code-row">
                      <span className="bp-line-num">{lineNum}</span>
                      <div className="bp-code-content">
                        {/* Tokenized rendering */}
                        <span className={lineIdx === 8 ? "bp-comment" : ""}>
                          {lineContent}
                        </span>

                        {/* Simulated Candidate Caret & Badge */}
                        {isCandLine && (
                          <span className="bp-sim-caret candidate">
                            <span className="bp-caret-pill">CANDIDATE</span>
                          </span>
                        )}

                        {/* Simulated Interviewer Caret & Badge */}
                        {isInterviewerLine && (
                          <span className="bp-sim-caret interviewer">
                            <span className="bp-caret-pill">INTERVIEWER</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Simulated Terminal Output Line */}
                {testOutputVisible && (
                  <div className="bp-terminal-result">
                    <span className="bp-test-pass">[PASS] 54/54 test cases successful (4ms)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* 3. Features Section: Evaluation Matrix */}
        <section className="bp-matrix">
          <div className="bp-section-header" ref={headerRuleRef}>
            <h2 className="bp-heading bp-matrix-title">System Specifications</h2>
            <div className={`bp-section-hr ${headerRuleVisible ? "drawn" : ""}`} />
          </div>

          <div
            className={`bp-matrix-grid ${cardsVisible ? "cards-in" : ""}`}
            ref={cardsRef}
          >
            {/* Spec 01 Card */}
            <div
              className="bp-spec-card"
              onMouseEnter={() => setHoveredCard(1)}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <div className="bp-spec-top-line" />
              <div className="bp-spec-header">
                <span>Spec_01</span>
                <span>SYNC_ENGINE</span>
              </div>
              <h3 className="bp-heading bp-spec-title">Zero-Latency Sync</h3>
              <p className="bp-spec-desc">
                High-performance CRDT synchronization guarantees that code renders instantly across all distinct client sessions without conflicts.
              </p>
              <div className="bp-spec-visual">
                <pre>{card1Full.slice(0, card1Progress)}</pre>
              </div>
            </div>

            {/* Spec 02 Card */}
            <div
              className="bp-spec-card"
              onMouseEnter={() => setHoveredCard(2)}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <div className="bp-spec-top-line" />
              <div className="bp-spec-header">
                <span>Spec_02</span>
                <span>COMPILER_ENV</span>
              </div>
              <h3 className="bp-heading bp-spec-title">Live Execution</h3>
              <p className="bp-spec-desc">
                Secure, isolated sandboxes for live code compilation. Automatically run logic against hidden, pre-configured edge cases.
              </p>
              <div className="bp-spec-visual">
                <pre>{card2Full.slice(0, card2Progress)}</pre>
              </div>
            </div>

            {/* Spec 03 Card */}
            <div
              className="bp-spec-card"
              onMouseEnter={() => setHoveredCard(3)}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <div className="bp-spec-top-line" />
              <div className="bp-spec-header">
                <span>Spec_03</span>
                <span>INTERVIEW_OPS</span>
              </div>
              <h3 className="bp-heading bp-spec-title">Interviewer Controls</h3>
              <p className="bp-spec-desc">
                Standardize your evaluation process with granular controls. Mute output, hide syntax errors, or seamlessly provide hints.
              </p>
              <div className="bp-spec-visual">
                <pre>{card3Full.slice(0, card3Progress)}</pre>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Social Proof & Footer: System Status */}
        <footer className="bp-footer" ref={statsRef}>
          <div className="bp-metrics">
            <div className="bp-metric-item">
              Avg Compile Time:{" "}
              <span className="bp-metric-value">{compileTimeVal}s</span>
            </div>
            <div className="bp-metric-item">
              Active Sessions:{" "}
              <span className="bp-metric-value">{activeSessionsVal}</span>
            </div>
            <div className="bp-metric-item">
              System Uptime:{" "}
              <span className="bp-metric-value">{uptimeVal}%</span>
            </div>
          </div>

          <button
            className={`bp-cta-final ${ctaInitializing ? "initializing" : ""}`}
            onClick={(e) => {
              if (setAuthForm) setAuthForm((prev) => ({ ...prev, role: "interviewer" }));
              handleInitClick(e, "register");
            }}
          >
            {ctaInitializing ? "> initializing..." : "Host Your Next Interview"}
          </button>

          <div className="bp-copyright">
            SYS_VERSION 1.0.4 &copy; {new Date().getFullYear()} INTERVIEWPAD. ALL RIGHTS RESERVED.
          </div>
        </footer>
      </div>
    </div>
  );
}

export default LandingPage;
