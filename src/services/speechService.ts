// Audio synthesis, speech synthesis, and speech recognition service

// Web Audio API chimes for tactile feedback
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playSuccessChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    // Crisp elegant double chime (Pentatonic G5 -> C6)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(783.99, now); // G5
    osc1.frequency.exponentialRampToValueAtTime(1046.50, now + 0.12); // C6

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(1046.50, now + 0.08);

    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.12, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.06);
    osc1.stop(now + 0.35);
    osc2.stop(now + 0.35);
  } catch {
    // Ignore audio autoplay restrictions
  }
}

export function playDrillScoreChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.18);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch {}
}

export function playTickChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(440, now);

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  } catch {}
}

// Speech synthesis helper with American English accent preference
export function speakWithAmericanAccent(textToSpeak: string, rate = 0.95) {
  if (!textToSpeak || typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }

  window.speechSynthesis.cancel();

  const performSpeak = () => {
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = rate;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();

    // Prioritize standard American / US English voices
    const usVoice =
      voices.find(
        (v) =>
          v.lang.toLowerCase() === "en-us" ||
          v.lang.toLowerCase().replace("_", "-") === "en-us"
      ) ||
      voices.find(
        (v) =>
          v.lang.toLowerCase().startsWith("en-us") ||
          (v.lang.toLowerCase().startsWith("en") &&
            (v.name.toLowerCase().includes("united states") ||
              v.name.toLowerCase().includes("us english") ||
              v.name.toLowerCase().includes("american") ||
              v.name.toLowerCase().includes("samantha") ||
              v.name.toLowerCase().includes("alex") ||
              v.name.toLowerCase().includes("natural")))
      ) ||
      voices.find((v) => v.lang.toLowerCase().startsWith("en"));

    if (usVoice) {
      utterance.voice = usVoice;
      utterance.lang = usVoice.lang || "en-US";
    } else {
      utterance.lang = "en-US";
    }

    window.speechSynthesis.speak(utterance);
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    performSpeak();
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      performSpeak();
    };
    setTimeout(performSpeak, 100);
  }
}

export const speakWithJapaneseAccent = speakWithAmericanAccent;

// Speech-to-Text Recognition for Two-Way Translation
export interface SpeechRecognitionController {
  start: () => void;
  stop: () => void;
  isSupported: boolean;
}

export function createSpeechRecognizer(
  onTranscript: (text: string, isFinal: boolean) => void,
  onError?: (error: string) => void
): SpeechRecognitionController {
  if (typeof window === "undefined") {
    return { start: () => {}, stop: () => {}, isSupported: false };
  }

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    return { start: () => {}, stop: () => {}, isSupported: false };
  }

  const recognizer = new SpeechRecognition();
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.lang = "en-US";

  recognizer.onresult = (event: any) => {
    let interimTranscript = "";
    let finalTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    if (finalTranscript) {
      onTranscript(finalTranscript.trim(), true);
    } else if (interimTranscript) {
      onTranscript(interimTranscript.trim(), false);
    }
  };

  recognizer.onerror = (event: any) => {
    if (onError && event.error !== "no-speech") {
      onError(event.error);
    }
  };

  return {
    start: () => {
      try {
        recognizer.start();
      } catch {}
    },
    stop: () => {
      try {
        recognizer.stop();
      } catch {}
    },
    isSupported: true,
  };
}
