import React, { useState, useEffect } from "react";
import { VogueLanding } from "./components/VogueLanding";
import { StudioHeader, StudioTab } from "./components/StudioHeader";
import { LiveCameraStudio } from "./components/LiveCameraStudio";
import { RealtimeTranslator } from "./components/RealtimeTranslator";
import { AiMentorChat } from "./components/AiMentorChat";
import { LearningDashboard } from "./components/LearningDashboard";
import { SamplingSettingsModal } from "./components/SamplingSettingsModal";
import { SamplingSettings, PracticeStats } from "./types/sign";

export default function App() {
  const [currentView, setCurrentView] = useState<"landing" | "studio">("landing");
  const [activeTab, setActiveTab] = useState<StudioTab>("practice");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Settings with persistence
  const [settings, setSettings] = useState<SamplingSettings>(() => {
    try {
      const saved = localStorage.getItem("aidsl_settings");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      confidenceThreshold: 80,
      samplingIntervalMs: 100,
      frameRateFps: 30,
      showSkeleton: true,
      mirrorCamera: true,
      gestureSmoothing: true,
      autoAdvance: true,
      audioFeedback: true,
      enableGeminiVision: true,
      hudTheme: "emerald",
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem("aidsl_settings", JSON.stringify(settings));
    } catch {}
  }, [settings]);

  // Basic practice stats
  const [stats, setStats] = useState<PracticeStats>(() => {
    try {
      const saved = localStorage.getItem("aidsl_practice_stats");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      totalPracticed: 58,
      lettersMastered: 16,
      streakDays: 7,
      accuracyRate: 97,
      recentHistory: [
        { letter: "B", accuracy: 98, date: "Today" },
        { letter: "A", accuracy: 96, date: "Today" },
        { letter: "L", accuracy: 95, date: "Yesterday" },
      ],
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem("aidsl_practice_stats", JSON.stringify(stats));
    } catch {}
  }, [stats]);

  const [practiceLetter, setPracticeLetter] = useState<string | undefined>(undefined);

  const handleLetterMastered = (letter: string) => {
    setStats((prev) => ({
      ...prev,
      lettersMastered: Math.min(26, prev.lettersMastered + 1),
      totalPracticed: prev.totalPracticed + 1,
    }));
  };

  const handlePracticeSpecificLetter = (letter: string) => {
    setPracticeLetter(letter.toUpperCase());
    setCurrentView("studio");
    setActiveTab("practice");
  };

  if (currentView === "landing") {
    return (
      <VogueLanding
        onEnterApp={(tab) => {
          if (tab) setActiveTab(tab);
          setCurrentView("studio");
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7F3] text-[#1A1A1A] font-sans flex flex-col justify-between selection:bg-black selection:text-white">
      
      {/* Top Header Navigation */}
      <StudioHeader
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onReturnHome={() => setCurrentView("landing")}
        settings={settings}
      />

      {/* Main Tab Content Viewport */}
      <main className="flex-1 py-4">
        {activeTab === "practice" && (
          <LiveCameraStudio
            settings={settings}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onUpdateSettings={setSettings}
            onLetterMastered={handleLetterMastered}
            practiceLetter={practiceLetter}
          />
        )}

        {activeTab === "realtime" && (
          <RealtimeTranslator settings={settings} />
        )}

        {activeTab === "mentor" && (
          <AiMentorChat
            settings={settings}
            onPracticeLetter={handlePracticeSpecificLetter}
          />
        )}

        {activeTab === "dashboard" && (
          <LearningDashboard
            stats={stats}
            onPracticeLetter={handlePracticeSpecificLetter}
          />
        )}
      </main>

      {/* Sampling Settings Modal */}
      <SamplingSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
      />

      {/* Studio Footer */}
      <footer className="border-t border-[#D1D1D1] py-4 px-6 text-center text-xs font-mono text-[#888]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>aidSL • The Language of Motion</span>
          <span>Powered by Gemini 3.8 & MediaPipe Neural ML</span>
        </div>
      </footer>

    </div>
  );
}
