export interface FingerState {
  thumb: "extended" | "curled" | "across" | "pinch";
  index: "extended" | "curled" | "bent" | "hooked";
  middle: "extended" | "curled" | "bent" | "hooked";
  ring: "extended" | "curled" | "bent";
  pinky: "extended" | "curled" | "bent";
}

export interface FingerAssessment {
  state: "extended" | "curled" | "bent" | "across" | "spread" | "pinch";
  status: "perfect" | "close" | "incorrect";
  message: string;
}

export interface LetterData {
  letter: string;
  title: string;
  description: string;
  geminiSubtext: string;
  tip: string;
  fingerState: FingerState;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  mnemonic?: string;
  handshapeFamily?: "Fist" | "Flat" | "Number" | "Pinched" | "Dual" | "Special";
}

export interface SamplingSettings {
  confidenceThreshold: number; // 50 - 95
  samplingIntervalMs: number; // 50 - 500
  frameRateFps: number; // 10, 15, 30
  showSkeleton: boolean;
  mirrorCamera: boolean;
  gestureSmoothing: boolean;
  autoAdvance: boolean;
  audioFeedback: boolean;
  enableGeminiVision: boolean;
  geminiApiKey?: string;
  hudTheme?: "emerald" | "cyan" | "amber" | "monochrome";
  themeMode?: "editorial" | "obsidian";
  voiceSpeed?: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D extends Point2D {
  z: number;
}

export interface DetectionResult {
  recognizedLetter: string;
  confidenceScore: number;
  isMatch: boolean;
  subtext: string;
  feedback: string;
  handDetected: boolean;
  landmarks?: Point3D[];
  fingerFeedback?: {
    thumb: FingerAssessment;
    index: FingerAssessment;
    middle: FingerAssessment;
    ring: FingerAssessment;
    pinky: FingerAssessment;
  };
  dominantHand?: "Left" | "Right";
  rawTopPredictions?: { letter: string; score: number }[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: string;
  practiceLetter?: string;
}

export interface ASLPhrase {
  id: string;
  phrase: string;
  category: "Greetings" | "Essentials" | "Polite" | "Emergency" | "Questions" | "Expressions";
  translation: string;
  explanation: string;
  letters: string[];
}

export interface PracticeStats {
  totalPracticed: number;
  lettersMastered: number;
  streakDays: number;
  accuracyRate: number;
  recentHistory: { letter: string; accuracy: number; date: string }[];
  drillHighScore?: number;
  drillBestStreak?: number;
}
