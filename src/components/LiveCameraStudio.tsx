import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Camera, Volume2, Sparkles, ChevronRight, ChevronLeft, Settings, AlertCircle, PlayCircle, RefreshCw, Info, X, CheckCircle, BookOpen, Eye, Zap, Layers, RefreshCcw } from "lucide-react";
import { ASL_ALPHABET, ASL_PHRASES } from "../data/aslAlphabet";
import { SamplingSettings, DetectionResult, Point3D, FingerAssessment } from "../types/sign";
import { speakWithAmericanAccent, playSuccessChime } from "../services/speechService";
import { initHandLandmarker, classifyHandGesture, drawHandLandmarksOnCanvas, generateSyntheticLandmarks, drawHandBoundingBoxWithLabel } from "../services/handDetector";
import { fetchSignSubtext, fetchFrameAnalysis } from "../services/geminiClient";
import confetti from "canvas-confetti";

interface LiveCameraStudioProps {
  settings: SamplingSettings;
  onOpenSettings: () => void;
  onUpdateSettings?: (newSettings: SamplingSettings) => void;
  onLetterMastered?: (letter: string) => void;
  practiceLetter?: string;
}

export interface StudioToken {
  id: string;
  type: "phrase" | "letter" | "space";
  value: string;
  display: string;
  phraseData?: (typeof ASL_PHRASES)[number];
}

const PRESET_DRILLS = [
  { label: "Greetings", text: "HELLO" },
  { label: "Love & Peace", text: "I LOVE YOU PEACE" },
  { label: "Polite Signs", text: "THANK YOU PLEASE" },
  { label: "Emergency", text: "HELP YES OK" },
  { label: "Foundations", text: "A B C D E" },
  { label: "Fingerspelling", text: "CAT SUN ASL" },
];

export function parseSentenceTokens(text: string): StudioToken[] {
  const upper = text.toUpperCase();
  const tokens: StudioToken[] = [];
  let i = 0;
  let tokenId = 0;

  const sortedPhrases = [...ASL_PHRASES].sort((a, b) => b.phrase.length - a.phrase.length);

  while (i < upper.length) {
    const remaining = upper.slice(i);
    let matchedPhrase: (typeof ASL_PHRASES)[number] | null = null;

    for (const phraseItem of sortedPhrases) {
      const phraseText = phraseItem.phrase.toUpperCase();
      if (remaining.startsWith(phraseText)) {
        const charBefore = i > 0 ? upper[i - 1] : " ";
        const charAfter = i + phraseText.length < upper.length ? upper[i + phraseText.length] : " ";
        const isBoundaryBefore = /[^A-Z0-9]/.test(charBefore);
        const isBoundaryAfter = /[^A-Z0-9]/.test(charAfter);

        if (isBoundaryBefore && isBoundaryAfter) {
          matchedPhrase = phraseItem;
          break;
        }
      }
    }

    if (matchedPhrase) {
      tokens.push({
        id: `phrase-${tokenId++}`,
        type: "phrase",
        value: matchedPhrase.phrase,
        display: matchedPhrase.phrase,
        phraseData: matchedPhrase,
      });
      i += matchedPhrase.phrase.length;
    } else {
      const char = upper[i];
      if (char === " " || char === "\n" || char === "\t") {
        tokens.push({
          id: `space-${tokenId++}`,
          type: "space",
          value: " ",
          display: " ",
        });
        i += 1;
      } else if (/[A-Z]/.test(char)) {
        tokens.push({
          id: `letter-${tokenId++}`,
          type: "letter",
          value: char,
          display: char,
        });
        i += 1;
      } else {
        tokens.push({
          id: `sep-${tokenId++}`,
          type: "space",
          value: char,
          display: char,
        });
        i += 1;
      }
    }
  }

  return tokens;
}

export const LiveCameraStudio: React.FC<LiveCameraStudioProps> = ({
  settings,
  onOpenSettings,
  onUpdateSettings,
  onLetterMastered,
  practiceLetter,
}) => {
  const [inputText, setInputText] = useState(practiceLetter ? practiceLetter.toUpperCase() : "HELLO WORLD");
  const [activeLetterIdx, setActiveLetterIdx] = useState(0);
  const [cameraMode, setCameraMode] = useState<"active" | "idle" | "denied" | "demo">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [subtext, setSubtext] = useState("");
  const [isLoadingSubtext, setIsLoadingSubtext] = useState(false);
  const [showGuidancePopup, setShowGuidancePopup] = useState(true);

  // Gemini vision deep analysis states
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<{
    matchScore: number;
    isMatch: boolean;
    subtext: string;
    feedback: string;
  } | null>(null);

  useEffect(() => {
    if (practiceLetter) {
      setInputText(practiceLetter.toUpperCase());
      setActiveLetterIdx(0);
    }
  }, [practiceLetter]);

  const [detection, setDetection] = useState<DetectionResult>({
    recognizedLetter: "?",
    confidenceScore: 0,
    isMatch: false,
    subtext: "Position hand clearly in frame...",
    feedback: "Awaiting hand placement...",
    handDetected: false,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const allTokens = useMemo(() => parseSentenceTokens(inputText), [inputText]);
  const playableTokens = useMemo(
    () => allTokens.filter((t) => t.type === "phrase" || t.type === "letter"),
    [allTokens]
  );

  const safeActiveIdx = playableTokens.length > 0
    ? Math.min(Math.max(0, activeLetterIdx), playableTokens.length - 1)
    : 0;

  const currentToken = playableTokens[safeActiveIdx] || {
    id: "def",
    type: "letter" as const,
    value: "H",
    display: "H",
  };

  const currentLetter = currentToken.value;
  const currentPhraseData = currentToken.phraseData;

  const letterData = currentPhraseData
    ? {
        letter: currentPhraseData.phrase,
        title: `${currentPhraseData.phrase} (${currentPhraseData.category})`,
        description: currentPhraseData.translation,
        geminiSubtext: currentPhraseData.explanation,
        tip: currentPhraseData.explanation,
        fingerState: { thumb: "extended" as const, index: "extended" as const, middle: "curled" as const, ring: "curled" as const, pinky: "extended" as const },
        difficulty: "Beginner" as const,
      }
    : (ASL_ALPHABET[currentLetter] || ASL_ALPHABET["H"]);

  const lettersScrollRef = useRef<HTMLDivElement | null>(null);
  const matchHoldRef = useRef<number>(0);

  // Auto scroll active token card into view
  useEffect(() => {
    if (lettersScrollRef.current) {
      const activeEl = lettersScrollRef.current.querySelector<HTMLElement>('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [safeActiveIdx, inputText]);

  // Fetch Gemini contextual subtext
  const fetchSubtext = useCallback(async (letter: string) => {
    setIsLoadingSubtext(true);
    try {
      const generated = await fetchSignSubtext(letter, inputText, settings.geminiApiKey);
      setSubtext(generated || letterData.geminiSubtext);
    } catch {
      setSubtext(letterData.geminiSubtext);
    } finally {
      setIsLoadingSubtext(false);
    }
  }, [inputText, letterData.geminiSubtext, settings.geminiApiKey]);

  useEffect(() => {
    fetchSubtext(currentLetter);
  }, [currentLetter, fetchSubtext]);

  // Request camera stream explicitly
  const requestCameraAccess = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Webcam access is not supported by your browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraMode("active");
    } catch (err: any) {
      console.warn("Camera access failed:", err);
      setCameraError(err?.message || "Camera permission requested was denied.");
      setCameraMode("demo");
    }
  };

  useEffect(() => {
    requestCameraAccess();

    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // One-click Deep Gemini Vision Analysis
  const handleDeepGeminiAnalysis = async () => {
    if (!videoRef.current && cameraMode !== "demo") return;

    setAiAnalyzing(true);
    try {
      let base64 = "";
      if (videoRef.current && cameraMode === "active") {
        const offscreen = document.createElement("canvas");
        offscreen.width = 640;
        offscreen.height = 480;
        const octx = offscreen.getContext("2d");
        if (octx) {
          octx.drawImage(videoRef.current, 0, 0, 640, 480);
          base64 = offscreen.toDataURL("image/jpeg", 0.85);
        }
      }

      const result = await fetchFrameAnalysis(base64, currentLetter, settings.geminiApiKey);
      setAiAnalysisResult(result);
      if (result.isMatch && settings.audioFeedback) {
        playSuccessChime();
      }
    } catch (err) {
      console.warn("Deep Gemini analysis failed:", err);
    } finally {
      setAiAnalyzing(false);
    }
  };

  // Main Detection loop
  useEffect(() => {
    let landmarker: any = null;
    let isActive = true;

    async function setupDetector() {
      landmarker = await initHandLandmarker();
    }
    setupDetector();

    const processFrame = () => {
      if (!isActive) return;

      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        if (ctx) {
          const hudColor =
            settings.hudTheme === "cyan" ? "#06B6D4" :
            settings.hudTheme === "amber" ? "#F59E0B" :
            settings.hudTheme === "monochrome" ? "#FFFFFF" :
            "#10B981";

          if (cameraMode === "active" && videoRef.current && videoRef.current.readyState >= 2) {
            const video = videoRef.current;
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            let detectedLandmarks: Point3D[] | null = null;
            if (landmarker) {
              try {
                const results = landmarker.detectForVideo(video, performance.now());
                if (results.landmarks && results.landmarks.length > 0) {
                  detectedLandmarks = results.landmarks[0] as Point3D[];
                }
              } catch {}
            }

            if (detectedLandmarks && detectedLandmarks.length >= 21) {
              const classification = classifyHandGesture(detectedLandmarks, currentLetter);

              if (settings.showSkeleton) {
                drawHandLandmarksOnCanvas(ctx, detectedLandmarks, canvas.width, canvas.height, settings.mirrorCamera, hudColor);
                drawHandBoundingBoxWithLabel(
                  ctx,
                  detectedLandmarks,
                  canvas.width,
                  canvas.height,
                  classification.predictedLetter,
                  classification.confidenceScore,
                  settings.mirrorCamera,
                  hudColor
                );
              }

              setDetection({
                recognizedLetter: classification.predictedLetter,
                confidenceScore: classification.confidenceScore,
                isMatch: classification.isMatch,
                subtext: classification.details,
                feedback: classification.isMatch ? "Posture Synchronized" : "Adjust Finger Alignment",
                handDetected: true,
                landmarks: detectedLandmarks,
                fingerFeedback: classification.fingerFeedback,
                rawTopPredictions: classification.rawTopPredictions,
              });

              // Auto-advance logic
              if (classification.isMatch) {
                matchHoldRef.current += 1;
                if (matchHoldRef.current === 16 && settings.autoAdvance) {
                  confetti({
                    particleCount: 35,
                    spread: 55,
                    origin: { y: 0.65 },
                    colors: ["#10B981", "#34D399", "#FBBF24"],
                  });

                  if (settings.audioFeedback) {
                    playSuccessChime();
                    speakWithAmericanAccent(currentLetter);
                  }

                  if (onLetterMastered) {
                    onLetterMastered(currentLetter);
                  }

                  if (safeActiveIdx < playableTokens.length - 1) {
                    setActiveLetterIdx((prev) => prev + 1);
                  }
                }
              } else {
                matchHoldRef.current = 0;
              }
            } else {
              setDetection({
                recognizedLetter: "?",
                confidenceScore: 0,
                isMatch: false,
                subtext: "Center your hand clearly in the camera frame",
                feedback: "Awaiting hand placement...",
                handDetected: false,
              });
              matchHoldRef.current = 0;
            }
          } else if (cameraMode === "demo") {
            // Simulator Mode
            canvas.width = 640;
            canvas.height = 480;
            ctx.fillStyle = "#0A0A0C";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Subtle cyber grid
            ctx.strokeStyle = "rgba(255,255,255,0.05)";
            ctx.lineWidth = 1;
            for (let x = 0; x < canvas.width; x += 40) {
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, canvas.height);
              ctx.stroke();
            }
            for (let y = 0; y < canvas.height; y += 40) {
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(canvas.width, y);
              ctx.stroke();
            }

            const simLandmarks = generateSyntheticLandmarks(currentLetter);
            const clf = classifyHandGesture(simLandmarks, currentLetter);

            if (settings.showSkeleton) {
              drawHandLandmarksOnCanvas(ctx, simLandmarks, canvas.width, canvas.height, false, hudColor);
              drawHandBoundingBoxWithLabel(ctx, simLandmarks, canvas.width, canvas.height, currentLetter, 94.5, false, hudColor);
            }

            setDetection({
              recognizedLetter: currentLetter,
              confidenceScore: 94.5,
              isMatch: true,
              subtext: clf.details,
              feedback: "Simulated Posture Synchronized",
              handDetected: true,
              landmarks: simLandmarks,
              fingerFeedback: clf.fingerFeedback,
              rawTopPredictions: clf.rawTopPredictions,
            });

            // Prevent auto-advance in simulator mode
            matchHoldRef.current = 0;
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    animFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      isActive = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [cameraMode, currentLetter, safeActiveIdx, playableTokens.length, settings, onLetterMastered]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Editorial Title & Preset Quick Selectors */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#D1D1D1] pb-4">
        <div>
          <span className="text-[10px] uppercase font-mono tracking-widest text-[#888] block">
            Studio Section 01
          </span>
          <h1 className="text-3xl font-serif font-black tracking-tight text-[#1A1A1A]">
            Interactive Posture Studio
          </h1>
          <p className="text-xs text-[#666] mt-0.5 max-w-xl">
            Real-time neural hand biomechanics tracking, joint angle verification, and Gemini vision assistance.
          </p>
        </div>

        {/* Quick drill selector buttons */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[#EAE8E2] p-1 border border-[#D1D1D1]">
          {PRESET_DRILLS.map((drill) => (
            <button
              key={drill.label}
              onClick={() => {
                setInputText(drill.text);
                setActiveLetterIdx(0);
              }}
              className="px-2.5 py-1 text-[11px] font-medium text-[#444] hover:text-black hover:bg-white transition-colors cursor-pointer"
            >
              {drill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sentence Scrubber & Current Sequence Ribbon */}
      <div className="bg-white border border-[#D1D1D1] p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono text-[#888]">Practice Text:</span>
            <input
              type="text"
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value.toUpperCase());
                setActiveLetterIdx(0);
              }}
              placeholder="TYPE PHRASE OR WORD (E.G. HELLO)..."
              className="text-xs font-mono font-bold tracking-wider px-3 py-1.5 bg-[#FAF9F5] border border-[#D1D1D1] focus:outline-none focus:border-black uppercase min-w-[240px]"
            />
          </div>

          <div className="flex items-center gap-3 text-xs text-[#666]">
            <span>Progress: {safeActiveIdx + 1} of {playableTokens.length}</span>
            <div className="flex gap-1">
              <button
                onClick={() => setActiveLetterIdx((p) => Math.max(0, p - 1))}
                disabled={safeActiveIdx === 0}
                className="p-1.5 border border-[#D1D1D1] hover:bg-neutral-100 disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setActiveLetterIdx((p) => Math.min(playableTokens.length - 1, p + 1))}
                disabled={safeActiveIdx >= playableTokens.length - 1}
                className="p-1.5 border border-[#D1D1D1] hover:bg-neutral-100 disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Horizontal Card Scrubber */}
        <div
          ref={lettersScrollRef}
          className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1"
        >
          {playableTokens.map((token, idx) => {
            const isActive = idx === safeActiveIdx;
            const isCompleted = idx < safeActiveIdx;
            return (
              <button
                key={token.id}
                data-active={isActive}
                onClick={() => setActiveLetterIdx(idx)}
                className={`shrink-0 px-4 py-3 flex flex-col items-center justify-center transition-all cursor-pointer border ${
                  isActive
                    ? "bg-black text-white border-black scale-105 shadow-md"
                    : isCompleted
                    ? "bg-[#F0FDF4] border-emerald-300 text-emerald-800"
                    : "bg-[#FAF9F5] border-[#D1D1D1] text-[#444] hover:border-black"
                }`}
              >
                <span className="text-xl font-serif font-black leading-none">
                  {token.display}
                </span>
                <span className="text-[9px] font-mono uppercase tracking-widest mt-1 opacity-75">
                  {token.type === "phrase" ? "Phrase" : `Step ${idx + 1}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Studio Viewport Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Camera Viewport with HUD */}
        <div className="lg:col-span-8 space-y-3">
          <div className="bg-[#0C0C0E] border border-[#2B2B30] relative min-h-[460px] flex items-center justify-center overflow-hidden shadow-lg">
            
            {/* Hidden Video Source */}
            <video
              ref={videoRef}
              playsInline
              muted
              className="hidden"
            />

            {/* Neural HUD Overlay Canvas */}
            <canvas
              ref={canvasRef}
              className="w-full h-full object-cover max-h-[520px]"
            />

            {/* Top Viewport HUD Bar */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
              <div className="bg-black/75 backdrop-blur-md border border-white/10 px-3 py-1.5 flex items-center gap-2 text-white text-[11px] font-mono pointer-events-auto">
                <span className={`w-2 h-2 rounded-full ${cameraMode === "active" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                <span>{cameraMode === "active" ? "NEURAL 60FPS" : "SIMULATOR ACTIVE"}</span>
              </div>

              <div className="flex items-center gap-2 pointer-events-auto">
                <button
                  onClick={handleDeepGeminiAnalysis}
                  disabled={aiAnalyzing}
                  className="bg-emerald-600/90 hover:bg-emerald-500 text-white text-[11px] font-semibold px-3 py-1.5 flex items-center gap-1.5 border border-emerald-400/30 transition-colors shadow-sm cursor-pointer"
                  title="Ask Gemini Vision for detailed posture evaluation"
                >
                  <Sparkles size={13} className={aiAnalyzing ? "animate-spin" : ""} />
                  <span>{aiAnalyzing ? "Gemini Verifying..." : "Gemini AI Vision"}</span>
                </button>

                <button
                  onClick={() => setCameraMode(cameraMode === "active" ? "demo" : "active")}
                  className="bg-black/75 hover:bg-black text-white text-[11px] font-mono px-3 py-1.5 border border-white/15 transition-colors cursor-pointer"
                >
                  {cameraMode === "active" ? "Switch to Simulator" : "Switch to Camera"}
                </button>
              </div>
            </div>

            {/* Bottom Status Ticker */}
            <div className="absolute bottom-3 left-3 right-3 bg-black/80 backdrop-blur-md border border-white/10 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-white">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${detection.isMatch ? "bg-emerald-400 shadow-[0_0_8px_#34D399]" : "bg-amber-400"}`} />
                <div>
                  <span className="text-[10px] uppercase font-mono tracking-widest text-neutral-400 block">
                    Recognition Status
                  </span>
                  <span className="text-sm font-semibold">
                    {detection.isMatch ? `Matched '${currentLetter}' Perfectly!` : detection.subtext}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs font-mono">
                <div>
                  <span className="text-[9px] uppercase text-neutral-400 block">Confidence</span>
                  <span className="text-emerald-400 font-bold">{detection.confidenceScore.toFixed(0)}%</span>
                </div>

                {settings.audioFeedback && (
                  <button
                    onClick={() => speakWithAmericanAccent(currentLetter)}
                    className="p-2 bg-white/10 hover:bg-white/20 transition-colors cursor-pointer text-white"
                    title="Pronounce letter"
                  >
                    <Volume2 size={14} />
                  </button>
                )}
              </div>
            </div>

          </div>

          {/* Deep Gemini AI Feedback Notification Banner */}
          {aiAnalysisResult && (
            <div className="bg-[#FAF9F5] border-l-4 border-emerald-600 p-4 border border-[#D1D1D1] relative">
              <button
                onClick={() => setAiAnalysisResult(null)}
                className="absolute top-2 right-2 text-[#888] hover:text-black cursor-pointer"
              >
                <X size={14} />
              </button>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={16} className="text-emerald-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#1A1A1A]">
                  Gemini 3.8 Multimodal Feedback
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold">
                  {aiAnalysisResult.matchScore}% Score
                </span>
              </div>
              <p className="text-xs text-[#333] leading-relaxed">
                {aiAnalysisResult.subtext} {aiAnalysisResult.feedback}
              </p>
            </div>
          )}

          {/* Real-time 5-Finger Biomechanics Radar */}
          {detection.fingerFeedback && (
            <div className="bg-white border border-[#D1D1D1] p-4 shadow-xs space-y-2">
              <span className="text-[10px] uppercase font-mono tracking-widest text-[#888] block">
                Real-Time Finger Biomechanics Breakdown
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {(["thumb", "index", "middle", "ring", "pinky"] as const).map((fingerName) => {
                  const assessment = detection.fingerFeedback?.[fingerName];
                  if (!assessment) return null;
                  const isGood = assessment.status === "perfect";
                  return (
                    <div
                      key={fingerName}
                      className={`p-2.5 border text-left flex flex-col justify-between ${
                        isGood
                          ? "bg-emerald-50/70 border-emerald-300 text-emerald-900"
                          : "bg-amber-50/70 border-amber-300 text-amber-900"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold uppercase font-mono">{fingerName}</span>
                        <span className={`w-2 h-2 rounded-full ${isGood ? "bg-emerald-500" : "bg-amber-500"}`} />
                      </div>
                      <span className="text-[10px] font-mono leading-tight">{assessment.message}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        {/* Right Column: Master Target Blueprint & Posture Guide */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Target Sign Blueprint Card */}
          <div className="bg-white border border-[#D1D1D1] p-6 shadow-xs space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-mono tracking-widest text-[#888]">
                  Target Blueprint
                </span>
                <h2 className="text-2xl font-serif font-black text-[#1A1A1A] mt-0.5">
                  {letterData.title}
                </h2>
              </div>

              <div className="w-16 h-16 bg-[#FAF9F5] border border-black flex items-center justify-center font-serif text-3xl font-black text-black shadow-inner">
                {currentLetter}
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="bg-[#FAF9F5] p-3 border-l-2 border-black text-[#444] leading-relaxed">
                <strong className="text-black block mb-0.5">Linguistic Handshape:</strong>
                {letterData.description}
              </div>

              <div className="p-3 bg-[#F0FDF4] border-l-2 border-emerald-600 text-emerald-900">
                <strong className="block mb-0.5 font-semibold">Master Instructor Tip:</strong>
                {isLoadingSubtext ? "Refining biomechanical advice..." : subtext}
              </div>
            </div>

            {/* Quick Practice Actions */}
            <div className="pt-2 border-t border-[#EAE8E2] flex items-center justify-between text-xs">
              <button
                onClick={() => speakWithAmericanAccent(letterData.description)}
                className="text-black hover:text-emerald-700 font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Volume2 size={14} /> Listen to Guidance
              </button>

              <button
                onClick={onOpenSettings}
                className="text-[#666] hover:text-black flex items-center gap-1 cursor-pointer transition-colors font-mono text-[11px]"
              >
                <Settings size={13} /> Settings
              </button>
            </div>
          </div>

          {/* Handshape Family & Difficulty Card */}
          <div className="bg-white border border-[#D1D1D1] p-4 text-xs space-y-3">
            <span className="text-[10px] uppercase font-mono tracking-widest text-[#888] block">
              Curriculum Metadata
            </span>

            <div className="flex items-center justify-between border-b border-[#EAE8E2] pb-2">
              <span className="text-[#666]">Difficulty Level</span>
              <span className="font-semibold text-black">{letterData.difficulty}</span>
            </div>

            <div className="flex items-center justify-between border-b border-[#EAE8E2] pb-2">
              <span className="text-[#666]">Detection Engine</span>
              <span className="font-mono text-emerald-700">MediaPipe Vision + Gemini</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#666]">Auto-Advance</span>
              <span className="font-mono font-semibold">{settings.autoAdvance ? "Enabled (16 Frames)" : "Disabled"}</span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
