import React, { useRef, useEffect, useState, useCallback } from "react";
import { Video, Copy, Volume2, Trash2, Check, Camera, RefreshCw, PlayCircle, AlertCircle, PlusCircle, Sparkles, VolumeX } from "lucide-react";
import { SamplingSettings, Point3D } from "../types/sign";
import { speakWithAmericanAccent, playSuccessChime } from "../services/speechService";
import { enhanceSentenceWithAI } from "../services/geminiClient";
import {
  initHandLandmarker,
  classifyHandGesture,
  detectSignLanguagePhrase,
  drawHandLandmarksOnCanvas,
  drawHandBoundingBoxWithLabel,
  generateSyntheticLandmarks,
} from "../services/handDetector";

interface RealtimeTranslatorProps {
  settings: SamplingSettings;
}

const COMMON_QUICK_SIGNS = [
  { text: "HELLO", label: "Hello 👋" },
  { text: "THANK YOU", label: "Thank You 🙏" },
  { text: "PLEASE", label: "Please 🤲" },
  { text: "I LOVE YOU", label: "I Love You 🤟" },
  { text: "YES", label: "Yes ✊" },
  { text: "NO", label: "No ✌️" },
  { text: "HELP", label: "Help 👍" },
  { text: "PEACE", label: "Peace ✌️" },
];

export const RealtimeTranslator: React.FC<RealtimeTranslatorProps> = ({ settings }) => {
  const [cameraMode, setCameraMode] = useState<"active" | "idle" | "denied" | "demo">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [currentPrediction, setCurrentPrediction] = useState<string>("hello");
  const [confidence, setConfidence] = useState<number>(0);
  const [autoAddMode, setAutoAddMode] = useState(false);
  const [holdCount, setHoldCount] = useState(0);

  // Transcript states
  const [translatedText, setTranslatedText] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancedResult, setEnhancedResult] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const lastSpokenTextRef = useRef<string>("");
  const lastSpokenTimestampRef = useRef<number>(0);

  const speakDebounced = useCallback((textToSpeak: string) => {
    if (!settings.audioFeedback) return;
    if (!textToSpeak || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const now = Date.now();
    const cleanText = textToSpeak.trim();
    if (cleanText === lastSpokenTextRef.current && now - lastSpokenTimestampRef.current < 2500) {
      return;
    }
    speakWithAmericanAccent(cleanText, 0.95);
    lastSpokenTextRef.current = cleanText;
    lastSpokenTimestampRef.current = now;
  }, [settings.audioFeedback]);

  // Request camera access
  const requestCameraAccess = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Webcam access not supported in this browser.");
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
      console.warn("Camera stream failed:", err);
      setCameraMode("demo");
    }
  };

  useEffect(() => {
    requestCameraAccess();
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Handle committing token to transcript
  const handleCommitToken = useCallback((item?: string) => {
    const textToAdd = (item || currentPrediction || "").toUpperCase().trim();
    if (!textToAdd) return;

    setTranslatedText((prev) => {
      const needsSpace = prev.length > 0 && !prev.endsWith(" ");
      const next = `${prev}${needsSpace ? " " : ""}${textToAdd}`;
      return next;
    });

    if (settings.audioFeedback) {
      speakDebounced(textToAdd);
      playSuccessChime();
    }
  }, [currentPrediction, settings.audioFeedback, speakDebounced]);

  // AI Grammar polish with Gemini
  const handleEnhanceGrammar = async () => {
    if (!translatedText.trim()) return;
    setIsEnhancing(true);
    try {
      const polished = await enhanceSentenceWithAI(translatedText, settings.geminiApiKey);
      setEnhancedResult(polished);
      if (settings.audioFeedback) {
        speakWithAmericanAccent(polished);
      }
    } catch (err) {
      console.warn("Grammar polish failed:", err);
    } finally {
      setIsEnhancing(false);
    }
  };

  // Main Detection loop
  useEffect(() => {
    let landmarker: any = null;
    let isActive = true;

    async function setup() {
      landmarker = await initHandLandmarker();
    }
    setup();

    const processFrame = () => {
      if (!isActive) return;

      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        if (ctx) {
          if (cameraMode === "active" && videoRef.current && videoRef.current.readyState >= 2) {
            const video = videoRef.current;
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            let detectedLandmarks: Point3D[] | null = null;
            if (landmarker) {
              try {
                const res = landmarker.detectForVideo(video, performance.now());
                if (res.landmarks && res.landmarks.length > 0) {
                  detectedLandmarks = res.landmarks[0] as Point3D[];
                }
              } catch {}
            }

            if (detectedLandmarks && detectedLandmarks.length >= 21) {
              const phraseResult = detectSignLanguagePhrase(detectedLandmarks);

              let finalPrediction = "HELLO";
              let finalScore = 0;

              if (phraseResult.isPhrase && phraseResult.confidence >= 75) {
                finalPrediction = phraseResult.phrase.toUpperCase();
                finalScore = phraseResult.confidence;
              } else {
                const clf = classifyHandGesture(detectedLandmarks, "");
                finalPrediction = clf.predictedLetter;
                finalScore = clf.confidenceScore;
              }

              if (settings.showSkeleton) {
                drawHandLandmarksOnCanvas(ctx, detectedLandmarks, canvas.width, canvas.height, settings.mirrorCamera, "#10B981");
              }

              drawHandBoundingBoxWithLabel(
                ctx,
                detectedLandmarks,
                canvas.width,
                canvas.height,
                finalPrediction,
                finalScore,
                settings.mirrorCamera,
                "#10B981"
              );

              setConfidence(finalScore);
              setCurrentPrediction(finalPrediction);

              // Auto-commit on holding sign steady (only in live webcam mode)
              if (finalScore >= settings.confidenceThreshold && autoAddMode) {
                setHoldCount((prev) => {
                  const next = prev + 1;
                  if (next === 26) {
                    handleCommitToken(finalPrediction);
                    return 0;
                  }
                  return next;
                });
              } else {
                setHoldCount(0);
              }
            } else {
              setConfidence(0);
              setHoldCount(0);
            }
          } else if (cameraMode === "demo") {
            // Simulator Mode (manual token addition, no auto-advance)
            canvas.width = 640;
            canvas.height = 480;
            ctx.fillStyle = "#0C0C0E";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const simItems = ["HELLO", "THANK YOU", "PEACE", "I LOVE YOU", "HELP", "YES", "OK"];
            const simIdx = Math.floor(Date.now() / 3500) % simItems.length;
            const simTarget = simItems[simIdx];
            const simLandmarks = generateSyntheticLandmarks(simTarget);

            if (settings.showSkeleton) {
              drawHandLandmarksOnCanvas(ctx, simLandmarks, canvas.width, canvas.height, false, "#10B981");
            }
            drawHandBoundingBoxWithLabel(ctx, simLandmarks, canvas.width, canvas.height, simTarget, 92.5, false, "#10B981");

            setConfidence(92.5);
            setCurrentPrediction(simTarget);
            setHoldCount(0);
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
  }, [cameraMode, autoAddMode, settings, handleCommitToken]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Top Banner */}
      <div className="border-b border-[#D1D1D1] pb-4">
        <span className="text-[10px] uppercase font-mono tracking-widest text-[#888] block">
          Studio Section 02
        </span>
        <h1 className="text-3xl font-serif font-black tracking-tight text-[#1A1A1A]">
          Realtime Sign Language Translator
        </h1>
        <p className="text-xs text-[#666] mt-0.5 max-w-xl">
          Continuous computer vision gesture recognition with automated phrase detection, grammar reconstruction, and voice readout.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Live Camera HUD Viewport */}
        <div className="lg:col-span-7 space-y-3">
          <div className="bg-[#0C0C0E] border border-[#2B2B30] relative min-h-[440px] flex items-center justify-center overflow-hidden shadow-md">
            
            <video
              ref={videoRef}
              playsInline
              muted
              className="hidden"
            />

            <canvas
              ref={canvasRef}
              className="w-full h-full object-cover max-h-[500px]"
            />

            {/* Viewport Top Bar */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
              <div className="bg-black/80 backdrop-blur-md border border-white/10 px-3 py-1.5 flex items-center gap-2 text-white text-[11px] font-mono pointer-events-auto">
                <span className={`w-2 h-2 rounded-full ${cameraMode === "active" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                <span>{cameraMode === "active" ? "CONTINUOUS FEED" : "SIMULATOR ACTIVE"}</span>
              </div>

              <div className="flex items-center gap-2 pointer-events-auto">
                <button
                  onClick={() => setAutoAddMode(!autoAddMode)}
                  className={`text-[11px] font-mono px-3 py-1.5 border transition-colors cursor-pointer ${
                    autoAddMode
                      ? "bg-emerald-600 text-white border-emerald-400"
                      : "bg-black/75 text-white border-white/15"
                  }`}
                >
                  Auto-Add: {autoAddMode ? "ON" : "OFF"}
                </button>

                <button
                  onClick={() => setCameraMode(cameraMode === "active" ? "demo" : "active")}
                  className="bg-black/75 hover:bg-black text-white text-[11px] font-mono px-3 py-1.5 border border-white/15 cursor-pointer"
                >
                  {cameraMode === "active" ? "Demo Mode" : "Webcam"}
                </button>
              </div>
            </div>

            {/* Live Recognition Banner */}
            <div className="absolute bottom-3 left-3 right-3 bg-black/80 backdrop-blur-md border border-white/10 p-3 flex items-center justify-between text-white">
              <div>
                <span className="text-[9px] uppercase font-mono text-neutral-400 block">Current Detected Gesture</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold font-mono text-white">{currentPrediction}</span>
                  <span className="text-xs font-mono text-emerald-400">{confidence.toFixed(0)}%</span>
                </div>
              </div>

              <button
                onClick={() => handleCommitToken(currentPrediction)}
                className="bg-white text-black px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-neutral-200 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <PlusCircle size={14} /> Add Word
              </button>
            </div>

          </div>

          {/* Quick Phrase Shelf */}
          <div className="bg-white border border-[#D1D1D1] p-3 shadow-xs space-y-1.5">
            <span className="text-[10px] uppercase font-mono tracking-widest text-[#888] block">
              Quick-Add Essential Signs
            </span>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_QUICK_SIGNS.map((item) => (
                <button
                  key={item.text}
                  onClick={() => handleCommitToken(item.text)}
                  className="px-3 py-1.5 bg-[#FAF9F5] border border-[#D1D1D1] hover:border-black text-xs font-medium text-[#333] transition-colors cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column: Sentence Assembly & AI Polish */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Live Transcript Card */}
          <div className="bg-white border border-[#D1D1D1] p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-mono tracking-widest text-[#888]">
                  Transcript Buffer
                </span>
                <h2 className="text-lg font-serif font-bold text-[#1A1A1A]">
                  Assembled Communication
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!translatedText) return;
                    navigator.clipboard.writeText(enhancedResult || translatedText);
                    setIsCopied(true);
                    setTimeout(() => setIsCopied(false), 2000);
                  }}
                  disabled={!translatedText}
                  className="p-1.5 border border-[#D1D1D1] hover:bg-neutral-100 disabled:opacity-30 cursor-pointer text-[#444]"
                  title="Copy to clipboard"
                >
                  {isCopied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                </button>

                <button
                  onClick={() => {
                    setTranslatedText("");
                    setEnhancedResult(null);
                  }}
                  disabled={!translatedText}
                  className="p-1.5 border border-[#D1D1D1] hover:bg-neutral-100 disabled:opacity-30 cursor-pointer text-red-600"
                  title="Clear transcript"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Raw Sign Output Display */}
            <div className="min-h-[120px] bg-[#FAF9F5] border border-[#D1D1D1] p-4 font-mono text-sm leading-relaxed text-[#1A1A1A] select-all">
              {translatedText ? (
                <div className="flex flex-wrap gap-2 items-center">
                  {translatedText.split(" ").map((token, i) => (
                    <span key={i} className="bg-white px-2 py-1 border border-[#D1D1D1] shadow-2xs font-bold text-xs">
                      {token}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-[#888] italic text-xs">
                  Hold signs in camera view or tap quick-add buttons to assemble phrases...
                </span>
              )}
            </div>

            {/* AI Polish Button */}
            <div className="flex gap-2">
              <button
                onClick={handleEnhanceGrammar}
                disabled={!translatedText.trim() || isEnhancing}
                className="flex-1 bg-black text-white py-2.5 px-4 font-semibold text-xs tracking-wider uppercase hover:bg-neutral-800 disabled:opacity-40 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles size={14} className={isEnhancing ? "animate-spin" : ""} />
                {isEnhancing ? "Polishing with Gemini..." : "Gemini AI Grammar Polish"}
              </button>

              <button
                onClick={() => speakWithAmericanAccent(enhancedResult || translatedText)}
                disabled={!translatedText.trim()}
                className="p-2.5 border border-[#D1D1D1] hover:bg-neutral-100 disabled:opacity-30 transition-colors cursor-pointer text-[#333]"
                title="Speak sentence aloud"
              >
                <Volume2 size={16} />
              </button>
            </div>

            {/* Enhanced Natural English Box */}
            {enhancedResult && (
              <div className="p-4 bg-[#F0FDF4] border-l-4 border-emerald-600 border border-[#D1D1D1] space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-900">
                  <span className="flex items-center gap-1">
                    <Sparkles size={13} className="text-emerald-600" /> Natural Spoken English Translation:
                  </span>
                  <button
                    onClick={() => speakWithAmericanAccent(enhancedResult)}
                    className="text-emerald-700 hover:text-emerald-900 cursor-pointer flex items-center gap-1 font-mono text-[11px]"
                  >
                    <Volume2 size={12} /> Play Audio
                  </button>
                </div>
                <p className="text-sm font-medium text-[#1A1A1A] leading-relaxed pt-1">
                  "{enhancedResult}"
                </p>
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
};
