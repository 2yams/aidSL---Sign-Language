import React, { useRef, useEffect, useState } from "react";
import { Camera, BookOpen, MessageSquare, ArrowRight, ShieldCheck, Cpu, Video } from "lucide-react";
import { initHandLandmarker, drawHandLandmarksOnCanvas } from "../services/handDetector";
import { Point3D } from "../types/sign";
import { StudioTab } from "./StudioHeader";

interface VogueLandingProps {
  onEnterApp: (tab?: StudioTab) => void;
}

export const VogueLanding: React.FC<VogueLandingProps> = ({ onEnterApp }) => {
  const [heroCamActive, setHeroCamActive] = useState(false);
  const [heroCamError, setHeroCamError] = useState<string | null>(null);
  const [handDetected, setHandDetected] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startHeroCamera = async () => {
    setHeroCamError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Webcam not supported in this browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setHeroCamActive(true);
    } catch (err: any) {
      console.warn("Hero camera access failed:", err);
      setHeroCamError(err?.message || "Camera access requested was denied.");
      setHeroCamActive(false);
    }
  };

  const stopHeroCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setHeroCamActive(false);
    setHandDetected(false);
  };

  useEffect(() => {
    let landmarker: any = null;
    let isActive = true;

    if (heroCamActive) {
      async function init() {
        landmarker = await initHandLandmarker();
      }
      init();

      const processFrame = () => {
        if (!isActive) return;

        if (canvasRef.current && videoRef.current && videoRef.current.readyState >= 2) {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext("2d");

          if (ctx) {
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
              drawHandLandmarksOnCanvas(ctx, detectedLandmarks, canvas.width, canvas.height, true, "#10B981");
              setHandDetected(true);
            } else {
              setHandDetected(false);
            }
          }
        }

        animFrameRef.current = requestAnimationFrame(processFrame);
      };

      animFrameRef.current = requestAnimationFrame(processFrame);
    }

    return () => {
      isActive = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [heroCamActive]);

  useEffect(() => {
    startHeroCamera();
    return () => {
      stopHeroCamera();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#F8F7F3] text-[#1A1A1A] font-sans flex flex-col justify-between relative overflow-hidden">
      
      {/* Top Bar Editorial Header */}
      <header className="h-16 border-b border-[#D1D1D1] px-6 lg:px-10 flex items-center justify-between sticky top-0 bg-[#F8F7F3]/90 backdrop-blur-md z-50">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-serif italic font-black tracking-tighter text-[#1A1A1A]">
            aid<span className="not-italic font-sans text-lg font-light text-[#888]">SL</span>
          </span>
          <span className="hidden sm:inline-block text-[10px] uppercase tracking-[0.2em] font-semibold text-[#888] border-l border-[#D1D1D1] pl-3">
            Neural Motion Studio
          </span>
        </div>

        <nav className="hidden md:flex gap-8 text-[11px] uppercase tracking-[0.15em] font-medium text-[#888]">
          <button className="hover:text-black cursor-pointer transition-colors" onClick={() => onEnterApp("practice")}>01. Live Studio</button>
          <button className="hover:text-black cursor-pointer transition-colors" onClick={() => onEnterApp("realtime")}>02. Sign Translator</button>
          <button className="hover:text-black cursor-pointer transition-colors" onClick={() => onEnterApp("mentor")}>03. AI Mentor</button>
          <button className="hover:text-black cursor-pointer transition-colors" onClick={() => onEnterApp("dashboard")}>04. Academy</button>
        </nav>

        <button
          onClick={() => onEnterApp("practice")}
          className="bg-black text-white px-5 py-2 text-[10px] uppercase tracking-[0.2em] font-semibold hover:bg-[#333] transition-colors cursor-pointer flex items-center gap-2"
        >
          <span>Launch Studio</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </header>

      {/* Main Editorial Hero */}
      <main className="max-w-7xl mx-auto px-6 lg:px-10 py-12 md:py-16 flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Headline Column */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#E8E6E1] border border-[#D1D1D1] text-[#1A1A1A] text-[10px] font-mono tracking-widest uppercase">
              <Cpu className="w-3.5 h-3.5 text-black" />
              <span>Real-Time 3D Neural Biomechanics</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-serif italic leading-[1.0] tracking-tighter text-[#1A1A1A]">
              The Language<br />
              <span className="font-sans not-italic font-light text-[#555]">of Motion.</span>
            </h1>

            <p className="text-[#555] text-base md:text-lg max-w-xl font-light leading-relaxed">
              Bridging the gap between silent expression and digital clarity with 60FPS neural hand tracking, joint angle verification, real-time sentence translation, and Gemini 3.8 master mentoring.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              <button
                onClick={() => onEnterApp("practice")}
                className="bg-black text-white px-8 py-3.5 text-xs uppercase tracking-[0.2em] font-bold hover:bg-[#333] transition-colors cursor-pointer flex items-center justify-center gap-3 shadow-md"
              >
                <span>Enter Live Studio</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => onEnterApp("realtime")}
                className="bg-white border border-[#D1D1D1] text-[#1A1A1A] px-6 py-3.5 text-xs uppercase tracking-[0.18em] font-bold hover:bg-neutral-100 transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Video size={14} />
                <span>Open Translator</span>
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono text-[#777] pt-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Zero-latency browser neural ML • No video leaves your local device</span>
            </div>
          </div>

          {/* Right Editorial Showcase Box */}
          <div className="lg:col-span-5">
            <div className="bg-white border border-[#D1D1D1] p-6 shadow-xl space-y-4">
              
              <div className="flex items-center justify-between border-b border-[#D1D1D1] pb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${heroCamActive ? "bg-emerald-600 animate-pulse" : "bg-amber-500"}`} />
                  <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#1A1A1A] font-bold">
                    Optic Tracking
                  </span>
                </div>
                <span className="text-[10px] font-mono text-black font-bold border border-black px-2 py-0.5 uppercase">
                  {heroCamActive ? (handDetected ? "Hand Synchronized" : "Wave Hand at Camera") : "Simulator Mode"}
                </span>
              </div>

              {/* Viewport Box with Live Camera Preview */}
              <div className="relative aspect-4/3 bg-[#0A0A0A] overflow-hidden flex items-center justify-center border border-white/10 group shadow-inner">
                
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] ${
                    heroCamActive ? "block" : "hidden"
                  }`}
                />

                <canvas
                  ref={canvasRef}
                  className={`absolute inset-0 w-full h-full z-10 ${
                    heroCamActive ? "block" : "hidden"
                  }`}
                />

                {!heroCamActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white z-10 bg-black/85">
                    <Video className="w-8 h-8 text-emerald-400 mb-2" />
                    <p className="text-xs text-zinc-300">Camera preview inactive</p>
                    <button
                      onClick={startHeroCamera}
                      className="mt-3 px-4 py-1.5 bg-white text-black text-xs font-mono font-bold hover:bg-neutral-200 cursor-pointer"
                    >
                      Enable Camera
                    </button>
                  </div>
                )}

                {/* Target Reticle */}
                <div className="relative z-20 pointer-events-none flex items-center justify-center">
                  <div className="w-28 h-28 border border-white/30 rounded-full flex items-center justify-center bg-black/20 backdrop-blur-xs">
                    <div className="w-20 h-20 border border-emerald-400/80 rounded-full animate-pulse flex items-center justify-center">
                      <span className="font-serif italic text-4xl text-white font-bold drop-shadow-md">ASL</span>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-3 left-3 right-3 bg-black/80 backdrop-blur-md p-2 border border-white/10 text-white z-20 text-center">
                  <p className="text-[10px] font-mono text-zinc-300">
                    {heroCamActive
                      ? "60FPS MediaPipe Vector Tracking Active"
                      : "Click 'Launch Studio' to begin full interactive practice"}
                  </p>
                </div>
              </div>

              {/* Modules Quick Links */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono text-[#555]">
                <button
                  onClick={() => onEnterApp("realtime")}
                  className="p-2.5 bg-[#FAF9F5] border border-[#E0E0E0] hover:border-black text-left cursor-pointer transition-colors"
                >
                  <span className="text-[#888] text-[9px] uppercase block">Module 02</span>
                  <span className="font-bold text-black text-[11px]">Sign Translator</span>
                </button>
                <button
                  onClick={() => onEnterApp("dashboard")}
                  className="p-2.5 bg-[#FAF9F5] border border-[#E0E0E0] hover:border-black text-left cursor-pointer transition-colors"
                >
                  <span className="text-[#888] text-[9px] uppercase block">Module 04</span>
                  <span className="font-bold text-black text-[11px]">Academy Matrix</span>
                </button>
              </div>

            </div>
          </div>

        </div>

        {/* Features Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 pt-10 border-t border-[#D1D1D1]">
          
          <div
            onClick={() => onEnterApp("practice")}
            className="p-6 bg-white border border-[#D1D1D1] hover:border-black transition-all cursor-pointer space-y-2 group shadow-xs"
          >
            <div className="w-8 h-8 bg-black text-white flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <h3 className="font-serif text-lg font-bold text-[#1A1A1A] group-hover:text-black">
              Neural Practice Studio
            </h3>
            <p className="text-xs text-[#555] font-light leading-relaxed">
              Step-by-step sign practice with 5-finger biomechanics radar, auto-advance, and audio guidance.
            </p>
          </div>

          <div
            onClick={() => onEnterApp("realtime")}
            className="p-6 bg-white border border-[#D1D1D1] hover:border-black transition-all cursor-pointer space-y-2 group shadow-xs"
          >
            <div className="w-8 h-8 bg-black text-white flex items-center justify-center">
              <Video className="w-4 h-4" />
            </div>
            <h3 className="font-serif text-lg font-bold text-[#1A1A1A] group-hover:text-black">
              Realtime Sign Translator
            </h3>
            <p className="text-xs text-[#555] font-light leading-relaxed">
              Continuous sign recognition with Gemini grammar polish and natural voice audio readout.
            </p>
          </div>

          <div
            onClick={() => onEnterApp("mentor")}
            className="p-6 bg-white border border-[#D1D1D1] hover:border-black transition-all cursor-pointer space-y-2 group shadow-xs"
          >
            <div className="w-8 h-8 bg-black text-white flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
            <h3 className="font-serif text-lg font-bold text-[#1A1A1A] group-hover:text-black">
              Gemini AI Mentor
            </h3>
            <p className="text-xs text-[#555] font-light leading-relaxed">
              Expert advice on Topic-Comment grammar, non-manual facial markers, and Deaf culture etiquette.
            </p>
          </div>

        </div>
      </main>

      {/* Editorial Footer */}
      <footer className="border-t border-[#D1D1D1] px-6 py-4 text-center text-xs font-mono text-[#888]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>aidSL • The Language of Motion</span>
          <span>Powered by Gemini 3.8 & MediaPipe Neural Vision</span>
        </div>
      </footer>

    </div>
  );
};
