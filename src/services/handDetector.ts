import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { Point3D, DetectionResult, FingerAssessment } from "../types/sign";

let handLandmarkerInstance: HandLandmarker | null = null;
let isInitializing = false;

export async function initHandLandmarker(): Promise<HandLandmarker | null> {
  if (handLandmarkerInstance) return handLandmarkerInstance;
  if (isInitializing) return null;

  isInitializing = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    handLandmarkerInstance = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
    });
    return handLandmarkerInstance;
  } catch (err) {
    console.warn("GPU MediaPipe fallback to CPU mode:", err);
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      handLandmarkerInstance = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
      });
      return handLandmarkerInstance;
    } catch (fallbackErr) {
      console.warn("MediaPipe CPU initialization error:", fallbackErr);
      return null;
    }
  } finally {
    isInitializing = false;
  }
}

// 3D vector helper functions
function dist3D(a: Point3D, b: Point3D): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function scoreRange(val: number, idealMin: number, idealMax: number, tolerance = 0.3): number {
  if (val >= idealMin && val <= idealMax) return 1.0;
  if (val < idealMin) {
    const diff = idealMin - val;
    return Math.max(0, 1.0 - diff / (tolerance || 0.001));
  } else {
    const diff = val - idealMax;
    return Math.max(0, 1.0 - diff / (tolerance || 0.001));
  }
}

function scoreMin(val: number, idealMin: number, tolerance = 0.35): number {
  if (val >= idealMin) return 1.0;
  return Math.max(0, 1.0 - (idealMin - val) / (tolerance || 0.001));
}

function scoreMax(val: number, idealMax: number, tolerance = 0.35): number {
  if (val <= idealMax) return 1.0;
  return Math.max(0, 1.0 - (val - idealMax) / (tolerance || 0.001));
}

// 2D line segment intersection for finger crossing (Letter R)
function segmentsIntersect2D(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number }
): boolean {
  const ccw = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
    (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

// Helper to determine single finger status vs expectation
function evaluateFinger(
  currentExt: number,
  expected: "extended" | "curled" | "bent",
  name: string
): FingerAssessment {
  const isExtended = currentExt > 1.30;
  const isCurled = currentExt < 1.15;
  const isBent = !isExtended && !isCurled;

  const actualState = isExtended ? "extended" : isCurled ? "curled" : "bent";

  if (expected === actualState) {
    return {
      state: actualState,
      status: "perfect",
      message: `${name} aligned correctly`,
    };
  }

  if (expected === "extended") {
    return {
      state: actualState,
      status: isBent ? "close" : "incorrect",
      message: `Extend ${name} straight up`,
    };
  }

  if (expected === "curled") {
    return {
      state: actualState,
      status: isBent ? "close" : "incorrect",
      message: `Curl ${name} tightly into palm`,
    };
  }

  return {
    state: actualState,
    status: "close",
    message: `Hook or bend ${name} gently`,
  };
}

export function classifyHandGesture(
  landmarks: Point3D[],
  targetLetter: string
): {
  confidenceScore: number;
  predictedLetter: string;
  isMatch: boolean;
  details: string;
  fingerFeedback: {
    thumb: FingerAssessment;
    index: FingerAssessment;
    middle: FingerAssessment;
    ring: FingerAssessment;
    pinky: FingerAssessment;
  };
  rawTopPredictions: { letter: string; score: number }[];
} {
  const defaultFeedback = {
    thumb: { state: "curled" as const, status: "incorrect" as const, message: "Hand not found" },
    index: { state: "curled" as const, status: "incorrect" as const, message: "Hand not found" },
    middle: { state: "curled" as const, status: "incorrect" as const, message: "Hand not found" },
    ring: { state: "curled" as const, status: "incorrect" as const, message: "Hand not found" },
    pinky: { state: "curled" as const, status: "incorrect" as const, message: "Hand not found" },
  };

  if (!landmarks || landmarks.length < 21) {
    return {
      confidenceScore: 0,
      predictedLetter: "?",
      isMatch: false,
      details: "Position your hand in camera frame",
      fingerFeedback: defaultFeedback,
      rawTopPredictions: [],
    };
  }

  const wrist = landmarks[0];
  const thumbCmcp = landmarks[1];
  const thumbMcp = landmarks[2];
  const thumbIp = landmarks[3];
  const thumbTip = landmarks[4];

  const indexMcp = landmarks[5];
  const indexPip = landmarks[6];
  const indexDip = landmarks[7];
  const indexTip = landmarks[8];

  const middleMcp = landmarks[9];
  const middlePip = landmarks[10];
  const middleDip = landmarks[11];
  const middleTip = landmarks[12];

  const ringMcp = landmarks[13];
  const ringPip = landmarks[14];
  const ringDip = landmarks[15];
  const ringTip = landmarks[16];

  const pinkyMcp = landmarks[17];
  const pinkyPip = landmarks[18];
  const pinkyDip = landmarks[19];
  const pinkyTip = landmarks[20];

  // Palm reference scale
  const palmScale = dist3D(wrist, middleMcp) || 0.1;

  // Extension ratios (wrist-to-tip distance divided by palm scale)
  const thumbExt = dist3D(wrist, thumbTip) / palmScale;
  const indexExt = dist3D(wrist, indexTip) / palmScale;
  const middleExt = dist3D(wrist, middleTip) / palmScale;
  const ringExt = dist3D(wrist, ringTip) / palmScale;
  const pinkyExt = dist3D(wrist, pinkyTip) / palmScale;

  // Inter-finger tip distances
  const indexMiddleDist = dist3D(indexTip, middleTip) / palmScale;
  const middleRingDist = dist3D(middleTip, ringTip) / palmScale;
  const ringPinkyDist = dist3D(ringTip, pinkyTip) / palmScale;
  const thumbIndexDist = dist3D(thumbTip, indexTip) / palmScale;
  const thumbMiddleDist = dist3D(thumbTip, middleTip) / palmScale;
  const thumbRingDist = dist3D(thumbTip, ringTip) / palmScale;
  const thumbPinkyDist = dist3D(thumbTip, pinkyTip) / palmScale;

  // Thumb spatial orientation metrics
  const thumbSideDist = dist3D(thumbTip, pinkyMcp) / palmScale;
  const thumbAcrossPalmDist = dist3D(thumbTip, indexMcp) / palmScale;
  const isThumbUpright = thumbTip.y < indexMcp.y && thumbSideDist > 0.65;
  const isThumbAcross = thumbAcrossPalmDist < 0.90 && thumbTip.x > Math.min(indexMcp.x, middleMcp.x) && thumbTip.x < Math.max(middleMcp.x, pinkyMcp.x);

  // Crossing detection for Index and Middle (Letter R)
  const mcpDx = middleMcp.x - indexMcp.x;
  const tipDx = middleTip.x - indexTip.x;
  const pipDx = middlePip.x - indexPip.x;

  const isCrossed2D = segmentsIntersect2D(indexMcp, indexTip, middleMcp, middleTip);
  const isLateralInverted = mcpDx * tipDx < -0.0001;
  const isPipTipCrossed = mcpDx * pipDx < -0.0001;
  const indexCrossedOverMiddle = dist3D(indexTip, middlePip) < 0.26 * palmScale || dist3D(indexTip, middleDip) < 0.24 * palmScale;
  const isFingerCrossed = isCrossed2D || isLateralInverted || isPipTipCrossed || (indexCrossedOverMiddle && indexMiddleDist < 0.32);

  const normTarget = (targetLetter || "").toUpperCase().trim();
  const PHRASE_SET = new Set(["PEACE", "HELLO", "HI", "I LOVE YOU", "THANK YOU", "PLEASE", "YES", "NO", "HELP", "OK"]);
  const isTargetingPhrase =
    PHRASE_SET.has(normTarget) ||
    normTarget.includes("LOVE") ||
    normTarget.includes("PEACE") ||
    normTarget.includes("HELLO") ||
    normTarget.includes("HI") ||
    normTarget.includes("THANK") ||
    normTarget.includes("PLEASE") ||
    normTarget.includes("HELP") ||
    normTarget.includes("OK");

  const candidates: { letter: string; score: number; details: string }[] = [];

  if (isTargetingPhrase) {
    // 1. I LOVE YOU
    {
      const idx = scoreMin(indexExt, 1.25, 0.4);
      const pinky = scoreMin(pinkyExt, 1.25, 0.4);
      const thumb = scoreMin(thumbSideDist, 0.75, 0.4);
      const mid = scoreMax(middleExt, 1.20, 0.35);
      const ring = scoreMax(ringExt, 1.20, 0.35);
      const total = (idx * 0.25 + pinky * 0.25 + thumb * 0.20 + mid * 0.15 + ring * 0.15) * 100;
      candidates.push({
        letter: "I LOVE YOU",
        score: Math.round(total),
        details: "I Love You: Thumb, index, and pinky extended, middle and ring curled.",
      });
    }

    // 2. PEACE
    {
      const idx = scoreMin(indexExt, 1.25, 0.4);
      const mid = scoreMin(middleExt, 1.25, 0.4);
      const spread = scoreMin(indexMiddleDist, 0.25, 0.35);
      const ring = scoreMax(ringExt, 1.20, 0.35);
      const pinky = scoreMax(pinkyExt, 1.20, 0.35);
      const total = (idx * 0.25 + mid * 0.25 + spread * 0.20 + ring * 0.15 + pinky * 0.15) * 100;
      candidates.push({
        letter: "PEACE",
        score: Math.round(total),
        details: "Peace: Index and middle fingers spread in a V, others folded.",
      });
    }

    // 3. HELLO / HI
    {
      const f2 = scoreMin(indexExt, 1.20, 0.35);
      const f3 = scoreMin(middleExt, 1.20, 0.35);
      const f4 = scoreMin(ringExt, 1.20, 0.35);
      const f5 = scoreMin(pinkyExt, 1.20, 0.35);
      const spread = scoreMin(indexMiddleDist, 0.20, 0.25);
      const total = Math.min(98, ((f2 + f3 + f4 + f5) / 4 * 0.75 + spread * 0.25) * 96);
      candidates.push({
        letter: "HELLO",
        score: Math.round(total),
        details: "Hello: Open palm with all fingers extended upright.",
      });
      candidates.push({
        letter: "HI",
        score: Math.round(total),
        details: "Hi: Open palm greeting gesture.",
      });
    }

    // 4. THANK YOU
    {
      const f2 = scoreMin(indexExt, 1.20, 0.35);
      const f3 = scoreMin(middleExt, 1.20, 0.35);
      const f4 = scoreMin(ringExt, 1.20, 0.35);
      const f5 = scoreMin(pinkyExt, 1.20, 0.35);
      const close = scoreMax(indexMiddleDist, 0.30, 0.25);
      const total = Math.min(98, ((f2 + f3 + f4 + f5) / 4 * 0.75 + close * 0.25) * 96);
      candidates.push({
        letter: "THANK YOU",
        score: Math.round(total),
        details: "Thank You: Flat hand moving forward from chin or chest.",
      });
    }

    // 5. PLEASE
    {
      const f2 = scoreMin(indexExt, 1.20, 0.35);
      const f3 = scoreMin(middleExt, 1.20, 0.35);
      const f4 = scoreMin(ringExt, 1.20, 0.35);
      const f5 = scoreMin(pinkyExt, 1.20, 0.35);
      const total = Math.min(98, ((f2 + f3 + f4 + f5) / 4) * 94);
      candidates.push({
        letter: "PLEASE",
        score: Math.round(total),
        details: "Please: Flat hand rubbed in gentle circular motion over chest.",
      });
    }

    // 6. YES
    {
      const curl = (scoreMax(indexExt, 1.15, 0.3) + scoreMax(middleExt, 1.15, 0.3) + scoreMax(ringExt, 1.15, 0.3) + scoreMax(pinkyExt, 1.15, 0.3)) / 4;
      const thumbRest = scoreMax(thumbSideDist, 0.85, 0.3);
      const total = (curl * 0.70 + thumbRest * 0.30) * 92;
      candidates.push({
        letter: "YES",
        score: Math.round(total),
        details: "Yes: Compact fist gently nodding up and down.",
      });
    }

    // 7. HELP
    {
      const thumbUp = scoreMin(thumbSideDist, 0.85, 0.35);
      const fingersCurled = (scoreMax(indexExt, 1.15, 0.3) + scoreMax(middleExt, 1.15, 0.3) + scoreMax(ringExt, 1.15, 0.3) + scoreMax(pinkyExt, 1.15, 0.3)) / 4;
      const total = (thumbUp * 0.55 + fingersCurled * 0.45) * 94;
      candidates.push({
        letter: "HELP",
        score: Math.round(total),
        details: "Help: Thumbs-up resting on flat open palm.",
      });
    }

    // 8. OK
    {
      const pinch = scoreRange(thumbIndexDist, 0.0, 0.35, 0.25);
      const outerExt = (scoreMin(middleExt, 1.30, 0.35) + scoreMin(ringExt, 1.30, 0.35) + scoreMin(pinkyExt, 1.30, 0.35)) / 3;
      const total = (pinch * 0.50 + outerExt * 0.50) * 95;
      candidates.push({
        letter: "OK",
        score: Math.round(total),
        details: "OK: Thumb and index forming a circle, three outer fingers extended.",
      });
    }
  } else {
    // ----------------------------------------------------
    // ALPHABET A through Z
    // ----------------------------------------------------

    // A: Compact fist with thumb resting upright on side of index finger
    {
      const curlScore = (scoreRange(indexExt, 0.5, 1.15, 0.3) + scoreRange(middleExt, 0.5, 1.15, 0.3) + scoreRange(ringExt, 0.5, 1.15, 0.3) + scoreRange(pinkyExt, 0.5, 1.15, 0.3)) / 4;
      const thumbUp = isThumbUpright ? 1.0 : scoreRange(thumbSideDist, 0.65, 1.5, 0.35);
      const notAcross = scoreRange(thumbAcrossPalmDist, 0.65, 1.6, 0.3);
      const total = (curlScore * 0.55 + thumbUp * 0.30 + notAcross * 0.15) * 95;
      candidates.push({ letter: "A", score: Math.round(total), details: "Letter A: Fist with thumb straight up alongside index." });
    }

    // B: 4 fingers extended together straight up, thumb tucked across palm
    {
      const extScore = (scoreRange(indexExt, 1.32, 2.0, 0.35) + scoreRange(middleExt, 1.32, 2.0, 0.35) + scoreRange(ringExt, 1.32, 2.0, 0.35) + scoreRange(pinkyExt, 1.30, 2.0, 0.35)) / 4;
      const tight = (scoreRange(indexMiddleDist, 0.0, 0.28, 0.2) + scoreRange(middleRingDist, 0.0, 0.28, 0.2)) / 2;
      const thumbTuck = scoreRange(thumbExt, 0.5, 1.15, 0.35);
      const total = (extScore * 0.60 + tight * 0.25 + thumbTuck * 0.15) * 96;
      candidates.push({ letter: "B", score: Math.round(total), details: "Letter B: 4 fingers extended together, thumb tucked across palm." });
    }

    // C: Curved hand forming C crescent
    {
      const curve = (scoreRange(indexExt, 1.15, 1.45, 0.3) + scoreRange(middleExt, 1.15, 1.45, 0.3) + scoreRange(ringExt, 1.15, 1.45, 0.3) + scoreRange(pinkyExt, 1.15, 1.45, 0.3)) / 4;
      const gap = scoreRange(thumbIndexDist, 0.38, 0.85, 0.3);
      const total = (curve * 0.65 + gap * 0.35) * 93;
      candidates.push({ letter: "C", score: Math.round(total), details: "Letter C: Hand curved forming an open C crescent." });
    }

    // D: Index finger straight up, other fingers curled touching thumb
    {
      const idxUp = scoreRange(indexExt, 1.35, 2.0, 0.35);
      const others = (scoreRange(middleExt, 0.5, 1.20, 0.3) + scoreRange(ringExt, 0.5, 1.18, 0.3) + scoreRange(pinkyExt, 0.5, 1.18, 0.3)) / 3;
      const circle = scoreRange(thumbMiddleDist, 0.0, 0.45, 0.3);
      const total = (idxUp * 0.45 + circle * 0.25 + others * 0.30) * 95;
      candidates.push({ letter: "D", score: Math.round(total), details: "Letter D: Index pointing straight up, other fingers forming ring with thumb." });
    }

    // E: Fingertips curled down resting on tucked thumb
    {
      const curl = (scoreRange(indexExt, 0.5, 1.10, 0.3) + scoreRange(middleExt, 0.5, 1.10, 0.3) + scoreRange(ringExt, 0.5, 1.10, 0.3) + scoreRange(pinkyExt, 0.5, 1.10, 0.3)) / 4;
      const thumbUnder = isThumbAcross ? 1.0 : scoreRange(thumbAcrossPalmDist, 0.0, 0.85, 0.3);
      const total = (curl * 0.70 + thumbUnder * 0.30) * 93;
      candidates.push({ letter: "E", score: Math.round(total), details: "Letter E: Fingertips curled down resting on tucked thumb." });
    }

    // F: Thumb and index in ring (OK), outer 3 fingers extended
    {
      const pinch = scoreRange(thumbIndexDist, 0.0, 0.38, 0.25);
      const outerExt = (scoreRange(middleExt, 1.30, 2.0, 0.35) + scoreRange(ringExt, 1.30, 2.0, 0.35) + scoreRange(pinkyExt, 1.30, 2.0, 0.35)) / 3;
      const total = (pinch * 0.45 + outerExt * 0.55) * 95;
      candidates.push({ letter: "F", score: Math.round(total), details: "Letter F: Thumb and index pinched, outer three fingers extended." });
    }

    // G: Index and thumb pointing horizontally
    {
      const idxUp = scoreRange(indexExt, 1.25, 2.0, 0.35);
      const thumbGrip = scoreRange(thumbSideDist, 0.55, 1.4, 0.35);
      const others = (scoreRange(middleExt, 0.5, 1.15, 0.3) + scoreRange(ringExt, 0.5, 1.15, 0.3) + scoreRange(pinkyExt, 0.5, 1.15, 0.3)) / 3;
      const total = (idxUp * 0.40 + thumbGrip * 0.30 + others * 0.30) * 93;
      candidates.push({ letter: "G", score: Math.round(total), details: "Letter G: Index and thumb pointing horizontally." });
    }

    // H: Index and middle extended together horizontally
    {
      const idxMid = (scoreRange(indexExt, 1.28, 2.0, 0.35) + scoreRange(middleExt, 1.28, 2.0, 0.35)) / 2;
      const together = scoreRange(indexMiddleDist, 0.0, 0.28, 0.2);
      const others = (scoreRange(ringExt, 0.5, 1.15, 0.3) + scoreRange(pinkyExt, 0.5, 1.15, 0.3)) / 2;
      const total = (idxMid * 0.50 + together * 0.25 + others * 0.25) * 94;
      candidates.push({ letter: "H", score: Math.round(total), details: "Letter H: Index and middle extended together sideways." });
    }

    // I: Pinky finger raised straight up, other fingers curled
    {
      const pinkyUp = scoreRange(pinkyExt, 1.35, 2.0, 0.35);
      const others = (scoreRange(indexExt, 0.5, 1.15, 0.3) + scoreRange(middleExt, 0.5, 1.15, 0.3) + scoreRange(ringExt, 0.5, 1.15, 0.3)) / 3;
      const thumbRest = scoreRange(thumbSideDist, 0.0, 0.85, 0.3);
      const total = (pinkyUp * 0.55 + others * 0.35 + thumbRest * 0.10) * 96;
      candidates.push({ letter: "I", score: Math.round(total), details: "Letter I: Pinky raised straight up, fist curled." });
    }

    // J: Pinky up tracing dynamic hook
    {
      const pinkyUp = scoreRange(pinkyExt, 1.35, 2.0, 0.35);
      const others = (scoreRange(indexExt, 0.5, 1.15, 0.3) + scoreRange(middleExt, 0.5, 1.15, 0.3) + scoreRange(ringExt, 0.5, 1.15, 0.3)) / 3;
      const total = (pinkyUp * 0.60 + others * 0.40) * 93;
      candidates.push({ letter: "J", score: Math.round(total), details: "Letter J: Pinky extended tracing a curved J hook." });
    }

    // K: Index up, middle angled forward, thumb tucked between knuckles
    {
      const idxUp = scoreRange(indexExt, 1.30, 2.0, 0.35);
      const midFwd = scoreRange(middleExt, 1.20, 1.70, 0.35);
      const thumbBetween = scoreRange(thumbMiddleDist, 0.15, 0.65, 0.3);
      const others = (scoreRange(ringExt, 0.5, 1.18, 0.3) + scoreRange(pinkyExt, 0.5, 1.18, 0.3)) / 2;
      const total = (idxUp * 0.35 + midFwd * 0.25 + thumbBetween * 0.20 + others * 0.20) * 94;
      candidates.push({ letter: "K", score: Math.round(total), details: "Letter K: Index up, middle angled, thumb between." });
    }

    // L: Index straight up and thumb extended sideways 90 deg
    {
      const idxUp = scoreRange(indexExt, 1.35, 2.0, 0.35);
      const thumbOut = scoreRange(thumbSideDist, 0.85, 2.0, 0.35);
      const others = (scoreRange(middleExt, 0.5, 1.15, 0.3) + scoreRange(ringExt, 0.5, 1.15, 0.3) + scoreRange(pinkyExt, 0.5, 1.15, 0.3)) / 3;
      const total = (idxUp * 0.45 + thumbOut * 0.35 + others * 0.20) * 96;
      candidates.push({ letter: "L", score: Math.round(total), details: "Letter L: Index straight up and thumb outward forming an L." });
    }

    // M: Fist with thumb tucked under 3 fingers
    {
      const curl = (scoreRange(indexExt, 0.5, 1.15, 0.3) + scoreRange(middleExt, 0.5, 1.15, 0.3) + scoreRange(ringExt, 0.5, 1.15, 0.3) + scoreRange(pinkyExt, 0.5, 1.15, 0.3)) / 4;
      const thumbUnder = scoreRange(thumbPinkyDist, 0.0, 0.55, 0.3);
      const total = (curl * 0.65 + thumbUnder * 0.35) * 91;
      candidates.push({ letter: "M", score: Math.round(total), details: "Letter M: Fist with thumb under three fingers." });
    }

    // N: Fist with thumb tucked under 2 fingers
    {
      const curl = (scoreRange(indexExt, 0.5, 1.15, 0.3) + scoreRange(middleExt, 0.5, 1.15, 0.3) + scoreRange(ringExt, 0.5, 1.15, 0.3) + scoreRange(pinkyExt, 0.5, 1.15, 0.3)) / 4;
      const thumbUnder = scoreRange(thumbRingDist, 0.0, 0.55, 0.3);
      const total = (curl * 0.65 + thumbUnder * 0.35) * 91;
      candidates.push({ letter: "N", score: Math.round(total), details: "Letter N: Fist with thumb under index and middle." });
    }

    // O: Fingertips meeting thumb tip in an O circle
    {
      const pinchO = (scoreRange(thumbIndexDist, 0.0, 0.35, 0.25) + scoreRange(thumbMiddleDist, 0.0, 0.40, 0.25)) / 2;
      const curved = (scoreRange(indexExt, 0.9, 1.30, 0.3) + scoreRange(middleExt, 0.9, 1.30, 0.3)) / 2;
      const total = (pinchO * 0.60 + curved * 0.40) * 94;
      candidates.push({ letter: "O", score: Math.round(total), details: "Letter O: All fingertips meeting thumb in an O circle." });
    }

    // P: Downward angled K shape
    {
      const idxExtS = scoreRange(indexExt, 1.25, 1.9, 0.35);
      const midExtS = scoreRange(middleExt, 1.15, 1.7, 0.35);
      const others = (scoreRange(ringExt, 0.5, 1.18, 0.3) + scoreRange(pinkyExt, 0.5, 1.18, 0.3)) / 2;
      const total = (idxExtS * 0.40 + midExtS * 0.30 + others * 0.30) * 92;
      candidates.push({ letter: "P", score: Math.round(total), details: "Letter P: Downward angled K shape." });
    }

    // Q: Downward pointing caliper pinch
    {
      const idxExtS = scoreRange(indexExt, 1.20, 1.8, 0.35);
      const thumbGrip = scoreRange(thumbIndexDist, 0.20, 0.65, 0.3);
      const others = (scoreRange(middleExt, 0.5, 1.15, 0.3) + scoreRange(ringExt, 0.5, 1.15, 0.3) + scoreRange(pinkyExt, 0.5, 1.15, 0.3)) / 3;
      const total = (idxExtS * 0.40 + thumbGrip * 0.30 + others * 0.30) * 92;
      candidates.push({ letter: "Q", score: Math.round(total), details: "Letter Q: Downward pointing caliper grip." });
    }

    // R: INDEX AND MIDDLE CROSSED OVER EACH OTHER
    {
      const idxExt = scoreRange(indexExt, 1.30, 2.0, 0.35);
      const midExt = scoreRange(middleExt, 1.30, 2.0, 0.35);
      const ringCurl = scoreRange(ringExt, 0.5, 1.18, 0.3);
      const pinkyCurl = scoreRange(pinkyExt, 0.5, 1.18, 0.3);

      let crossScore = 0.2;
      if (isFingerCrossed) {
        crossScore = 1.0;
      } else if (indexMiddleDist < 0.25) {
        crossScore = 0.75;
      } else {
        crossScore = Math.max(0, 0.5 - indexMiddleDist);
      }

      const total = (idxExt * 0.25 + midExt * 0.25 + crossScore * 0.30 + ringCurl * 0.10 + pinkyCurl * 0.10) * 96;
      candidates.push({
        letter: "R",
        score: Math.round(total),
        details: "Letter R: Index and middle fingers crossed over each other.",
      });
    }

    // S: Tight fist with thumb crossed in front of fingers
    {
      const curl = (scoreRange(indexExt, 0.5, 1.12, 0.3) + scoreRange(middleExt, 0.5, 1.12, 0.3) + scoreRange(ringExt, 0.5, 1.12, 0.3) + scoreRange(pinkyExt, 0.5, 1.12, 0.3)) / 4;
      const thumbAcross = isThumbAcross ? 1.0 : scoreRange(thumbAcrossPalmDist, 0.0, 0.85, 0.3);
      const notUpright = !isThumbUpright ? 1.0 : 0.4;
      const total = (curl * 0.55 + thumbAcross * 0.30 + notUpright * 0.15) * 95;
      candidates.push({ letter: "S", score: Math.round(total), details: "Letter S: Tight fist with thumb wrapped across middle." });
    }

    // T: Fist with thumb poking between index and middle
    {
      const curl = (scoreRange(indexExt, 0.5, 1.15, 0.3) + scoreRange(middleExt, 0.5, 1.15, 0.3) + scoreRange(ringExt, 0.5, 1.15, 0.3) + scoreRange(pinkyExt, 0.5, 1.15, 0.3)) / 4;
      const thumbTucked = scoreRange(dist3D(thumbTip, indexPip) / palmScale, 0.0, 0.45, 0.25);
      const total = (curl * 0.65 + thumbTucked * 0.35) * 92;
      candidates.push({ letter: "T", score: Math.round(total), details: "Letter T: Fist with thumb between index and middle fingers." });
    }

    // U: Index and middle held straight up pressed tightly together (UNCROSSED)
    {
      const idxExt = scoreRange(indexExt, 1.30, 2.0, 0.35);
      const midExt = scoreRange(middleExt, 1.30, 2.0, 0.35);
      const together = scoreRange(indexMiddleDist, 0.0, 0.26, 0.2);
      const uncrossed = !isFingerCrossed ? 1.0 : 0.35;
      const others = (scoreRange(ringExt, 0.5, 1.18, 0.3) + scoreRange(pinkyExt, 0.5, 1.18, 0.3)) / 2;
      const total = (idxExt * 0.25 + midExt * 0.25 + together * 0.20 + uncrossed * 0.15 + others * 0.15) * 96;
      candidates.push({ letter: "U", score: Math.round(total), details: "Letter U: Index and middle held straight up together." });
    }

    // V: Index and middle spread in sharp victory/peace sign (UNCROSSED & SPREAD)
    {
      const idxExt = scoreRange(indexExt, 1.30, 2.0, 0.35);
      const midExt = scoreRange(middleExt, 1.30, 2.0, 0.35);
      const spread = scoreRange(indexMiddleDist, 0.32, 1.1, 0.35);
      const uncrossed = !isFingerCrossed ? 1.0 : 0.2;
      const others = (scoreRange(ringExt, 0.5, 1.18, 0.3) + scoreRange(pinkyExt, 0.5, 1.18, 0.3)) / 2;
      const total = (idxExt * 0.25 + midExt * 0.25 + spread * 0.25 + uncrossed * 0.10 + others * 0.15) * 96;
      candidates.push({ letter: "V", score: Math.round(total), details: "Letter V: Index and middle spread apart in a V." });
    }

    // W: Three fingers spread up in open W fan
    {
      const idxExt = scoreRange(indexExt, 1.30, 2.0, 0.35);
      const midExt = scoreRange(middleExt, 1.30, 2.0, 0.35);
      const ringExtS = scoreRange(ringExt, 1.30, 2.0, 0.35);
      const pinkyCurled = scoreRange(pinkyExt, 0.5, 1.18, 0.3);
      const spread = (scoreRange(indexMiddleDist, 0.22, 0.8, 0.25) + scoreRange(middleRingDist, 0.22, 0.8, 0.25)) / 2;
      const total = (idxExt * 0.25 + midExt * 0.25 + ringExtS * 0.25 + spread * 0.15 + pinkyCurled * 0.10) * 95;
      candidates.push({ letter: "W", score: Math.round(total), details: "Letter W: Three fingers spread up in a W fan." });
    }

    // X: Index finger hooked like a claw
    {
      const indexHook = scoreRange(indexExt, 1.05, 1.35, 0.25);
      const others = (scoreRange(middleExt, 0.5, 1.15, 0.3) + scoreRange(ringExt, 0.5, 1.15, 0.3) + scoreRange(pinkyExt, 0.5, 1.15, 0.3)) / 3;
      const total = (indexHook * 0.60 + others * 0.40) * 93;
      candidates.push({ letter: "X", score: Math.round(total), details: "Letter X: Index hooked like a claw, others curled." });
    }

    // Y: Thumb and pinky extended wide, middle fingers curled
    {
      const pinkyUp = scoreRange(pinkyExt, 1.35, 2.0, 0.35);
      const thumbOut = scoreRange(thumbSideDist, 0.85, 2.0, 0.35);
      const midCurled = (scoreRange(indexExt, 0.5, 1.15, 0.3) + scoreRange(middleExt, 0.5, 1.15, 0.3) + scoreRange(ringExt, 0.5, 1.15, 0.3)) / 3;
      const total = (pinkyUp * 0.40 + thumbOut * 0.35 + midCurled * 0.25) * 96;
      candidates.push({ letter: "Y", score: Math.round(total), details: "Letter Y: Thumb and pinky extended, middle fingers curled." });
    }

    // Z: Index finger extended to trace a Z in the air
    {
      const indexUp = scoreRange(indexExt, 1.30, 2.0, 0.35);
      const others = (scoreRange(middleExt, 0.5, 1.15, 0.3) + scoreRange(ringExt, 0.5, 1.15, 0.3) + scoreRange(pinkyExt, 0.5, 1.15, 0.3)) / 3;
      const total = (indexUp * 0.60 + others * 0.40) * 93;
      candidates.push({ letter: "Z", score: Math.round(total), details: "Letter Z: Index finger extended to trace Z in the air." });
    }
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);

  const bestCandidate = candidates[0] || {
    letter: targetLetter || "A",
    score: 60,
    details: "Forming hand shape",
  };

  const runnerUp = candidates[1] || { letter: "", score: 0, details: "" };
  const predicted = bestCandidate.letter;
  const rawTopScore = bestCandidate.score;

  // Confidence margin calibration
  const separationMargin = Math.max(0, Math.min(20, rawTopScore - runnerUp.score));
  const calibratedConfidence = clamp(
    rawTopScore * 0.90 + (separationMargin / 20) * 8,
    30,
    98
  );

  // Subtle natural jitter micro-variation
  const landmarkNoise = Math.abs(Math.sin(landmarks[8].x * 100 + landmarks[8].y * 100)) * 1.5;
  const finalConfidence = Math.round((calibratedConfidence - landmarkNoise) * 10) / 10;

  // Match evaluation
  let isMatch = false;
  const isGreetingTarget = normTarget === "HELLO" || normTarget === "HI";
  const isGreetingPredicted = predicted.toUpperCase() === "HELLO" || predicted.toUpperCase() === "HI";

  if (normTarget) {
    if (predicted.toUpperCase() === normTarget) {
      isMatch = finalConfidence >= 68;
    } else if (isGreetingTarget && isGreetingPredicted) {
      isMatch = finalConfidence >= 68;
    } else if (isTargetingPhrase) {
      if (isGreetingTarget && (isGreetingPredicted || predicted === "B" || predicted === "THANK YOU")) {
        isMatch = finalConfidence >= 68;
      } else if (normTarget === "I LOVE YOU" && (predicted === "I LOVE YOU" || predicted === "Y")) {
        isMatch = finalConfidence >= 68;
      } else if (normTarget === "PEACE" && (predicted === "PEACE" || predicted === "V")) {
        isMatch = finalConfidence >= 68;
      } else if (normTarget === "THANK YOU" && (predicted === "THANK YOU" || predicted === "B" || predicted === "HELLO" || predicted === "HI")) {
        isMatch = finalConfidence >= 65;
      } else if (normTarget === "PLEASE" && (predicted === "PLEASE" || predicted === "B" || predicted === "THANK YOU")) {
        isMatch = finalConfidence >= 65;
      }
    }
  }

  // Generate granular finger assessments for the target letter
  const targetKey = normTarget || predicted;
  let expectedFingerStates: Record<string, "extended" | "curled" | "bent"> = {
    index: "curled",
    middle: "curled",
    ring: "curled",
    pinky: "curled",
  };

  if (targetKey === "B" || targetKey === "HELLO" || targetKey === "HI" || targetKey === "THANK YOU" || targetKey === "PLEASE") {
    expectedFingerStates = { index: "extended", middle: "extended", ring: "extended", pinky: "extended" };
  } else if (targetKey === "D" || targetKey === "G" || targetKey === "Z" || targetKey === "X") {
    expectedFingerStates = { index: "extended", middle: "curled", ring: "curled", pinky: "curled" };
  } else if (targetKey === "H" || targetKey === "K" || targetKey === "U" || targetKey === "V" || targetKey === "R" || targetKey === "PEACE") {
    expectedFingerStates = { index: "extended", middle: "extended", ring: "curled", pinky: "curled" };
  } else if (targetKey === "W") {
    expectedFingerStates = { index: "extended", middle: "extended", ring: "extended", pinky: "curled" };
  } else if (targetKey === "F") {
    expectedFingerStates = { index: "curled", middle: "extended", ring: "extended", pinky: "extended" };
  } else if (targetKey === "I" || targetKey === "J") {
    expectedFingerStates = { index: "curled", middle: "curled", ring: "curled", pinky: "extended" };
  } else if (targetKey === "Y" || targetKey === "I LOVE YOU") {
    expectedFingerStates = { index: targetKey === "I LOVE YOU" ? "extended" : "curled", middle: "curled", ring: "curled", pinky: "extended" };
  } else if (targetKey === "C" || targetKey === "O") {
    expectedFingerStates = { index: "bent", middle: "bent", ring: "bent", pinky: "bent" };
  }

  const thumbAssessment: FingerAssessment = (() => {
    if (targetKey === "A") {
      return isThumbUpright
        ? { state: "extended", status: "perfect", message: "Thumb upright on side" }
        : { state: "curled", status: "close", message: "Point thumb straight up on index side" };
    }
    if (targetKey === "B") {
      return isThumbAcross
        ? { state: "across", status: "perfect", message: "Thumb folded across palm" }
        : { state: "extended", status: "close", message: "Fold thumb across lower palm" };
    }
    if (targetKey === "L" || targetKey === "Y" || targetKey === "I LOVE YOU") {
      return thumbSideDist > 0.80
        ? { state: "extended", status: "perfect", message: "Thumb extended outward" }
        : { state: "curled", status: "close", message: "Stick thumb straight out" };
    }
    return { state: isThumbAcross ? "across" : "curled", status: "perfect", message: "Thumb in position" };
  })();

  const fingerFeedback = {
    thumb: thumbAssessment,
    index: evaluateFinger(indexExt, expectedFingerStates.index, "Index finger"),
    middle: evaluateFinger(middleExt, expectedFingerStates.middle, "Middle finger"),
    ring: evaluateFinger(ringExt, expectedFingerStates.ring, "Ring finger"),
    pinky: evaluateFinger(pinkyExt, expectedFingerStates.pinky, "Pinky finger"),
  };

  let feedbackDetails = bestCandidate.details;
  if (isMatch) {
    feedbackDetails = `Accurate sign for ${normTarget}! Great posture.`;
  } else if (normTarget && normTarget !== predicted) {
    feedbackDetails = `Detected '${predicted}'. Adjust hand to form '${normTarget}'.`;
  }

  return {
    confidenceScore: finalConfidence,
    predictedLetter: predicted,
    isMatch,
    details: feedbackDetails,
    fingerFeedback,
    rawTopPredictions: candidates.slice(0, 4).map((c) => ({ letter: c.letter, score: c.score })),
  };
}

export function detectSignLanguagePhrase(landmarks: Point3D[]): {
  isPhrase: boolean;
  phrase: string;
  confidence: number;
} {
  if (!landmarks || landmarks.length < 21) {
    return { isPhrase: false, phrase: "", confidence: 0 };
  }

  const wrist = landmarks[0];
  const thumbTip = landmarks[4];
  const indexMcp = landmarks[5];
  const indexTip = landmarks[8];
  const middleMcp = landmarks[9];
  const middleTip = landmarks[12];
  const ringTip = landmarks[16];
  const pinkyMcp = landmarks[17];
  const pinkyTip = landmarks[20];

  const palmScale = dist3D(wrist, middleMcp) || 0.1;

  const isIndexExt = dist3D(wrist, indexTip) > palmScale * 1.30;
  const isMiddleExt = dist3D(wrist, middleTip) > palmScale * 1.30;
  const isRingExt = dist3D(wrist, ringTip) > palmScale * 1.30;
  const isPinkyExt = dist3D(wrist, pinkyTip) > palmScale * 1.30;

  const isIndexCurled = dist3D(wrist, indexTip) < palmScale * 1.15;
  const isMiddleCurled = dist3D(wrist, middleTip) < palmScale * 1.15;
  const isRingCurled = dist3D(wrist, ringTip) < palmScale * 1.15;
  const isPinkyCurled = dist3D(wrist, pinkyTip) < palmScale * 1.15;

  const thumbSideDist = dist3D(thumbTip, pinkyMcp) / palmScale;
  const thumbIndexDist = dist3D(thumbTip, indexTip) / palmScale;
  const indexMiddleDist = dist3D(indexTip, middleTip) / palmScale;
  const middleRingDist = dist3D(middleTip, ringTip) / palmScale;

  // 1. I LOVE YOU (ASL: Thumb + Index + Pinky up)
  if (isIndexExt && isMiddleCurled && isRingCurled && isPinkyExt && thumbSideDist > 0.78) {
    const conf = Math.round((82 + Math.min(14, thumbSideDist * 6)) * 10) / 10;
    return { isPhrase: true, phrase: "i love you", confidence: conf };
  }

  // 2. HELLO vs THANK YOU
  if (isIndexExt && isMiddleExt && isRingExt && isPinkyExt) {
    const isFingersSpread = indexMiddleDist > 0.28 || middleRingDist > 0.28 || thumbSideDist > 1.05;
    if (!isFingersSpread) {
      return { isPhrase: true, phrase: "thank you", confidence: 88.5 };
    }
    return { isPhrase: true, phrase: "hello", confidence: 91.0 };
  }

  // 3. YES (Fist nod)
  if (isIndexCurled && isMiddleCurled && isRingCurled && isPinkyCurled && thumbSideDist < 0.8) {
    return { isPhrase: true, phrase: "yes", confidence: 84.0 };
  }

  // 4. HELP (Thumbs up)
  if (!isIndexExt && !isMiddleExt && !isRingExt && !isPinkyExt && thumbSideDist > 0.8 && thumbTip.y < indexMcp.y) {
    return { isPhrase: true, phrase: "help", confidence: 86.0 };
  }

  // 5. PEACE
  if (isIndexExt && isMiddleExt && isRingCurled && isPinkyCurled && indexMiddleDist > 0.30) {
    return { isPhrase: true, phrase: "peace", confidence: 87.0 };
  }

  // 6. OK
  if (isMiddleExt && isRingExt && isPinkyExt && thumbIndexDist < 0.35) {
    return { isPhrase: true, phrase: "ok", confidence: 86.5 };
  }

  return { isPhrase: false, phrase: "", confidence: 0 };
}

// Bounding box & HUD reticle with confidence & prediction tags
export function drawHandBoundingBoxWithLabel(
  ctx: CanvasRenderingContext2D,
  landmarks: Point3D[],
  width: number,
  height: number,
  label: string,
  confidence: number,
  isMirrored = true,
  themeColor = "#10B981"
) {
  if (!landmarks || landmarks.length === 0) return;

  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;

  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const paddingX = width * 0.045;
  const paddingY = height * 0.055;

  let left: number;
  let right: number;
  if (isMirrored) {
    left = Math.max(10, (1 - maxX) * width - paddingX);
    right = Math.min(width - 10, (1 - minX) * width + paddingX);
  } else {
    left = Math.max(10, minX * width - paddingX);
    right = Math.min(width - 10, maxX * width + paddingX);
  }

  const top = Math.max(52, minY * height - paddingY);
  const bottom = Math.min(height - 10, maxY * height + paddingY);
  const boxW = Math.max(30, right - left);
  const boxH = Math.max(30, bottom - top);

  ctx.save();

  // Subtle target frame corner brackets (precision optical HUD)
  const cornerLen = Math.min(24, boxW * 0.22, boxH * 0.22);
  ctx.strokeStyle = themeColor;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";

  // Top-Left corner
  ctx.beginPath();
  ctx.moveTo(left, top + cornerLen);
  ctx.lineTo(left, top);
  ctx.lineTo(left + cornerLen, top);
  ctx.stroke();

  // Top-Right corner
  ctx.beginPath();
  ctx.moveTo(right - cornerLen, top);
  ctx.lineTo(right, top);
  ctx.lineTo(right, top + cornerLen);
  ctx.stroke();

  // Bottom-Left corner
  ctx.beginPath();
  ctx.moveTo(left, bottom - cornerLen);
  ctx.lineTo(left, bottom);
  ctx.lineTo(left + cornerLen, bottom);
  ctx.stroke();

  // Bottom-Right corner
  ctx.beginPath();
  ctx.moveTo(right - cornerLen, bottom);
  ctx.lineTo(right, bottom);
  ctx.lineTo(right, bottom - cornerLen);
  ctx.stroke();

  // Subtle translucent border fill
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  const labelH = 34;
  const labelW = Math.max(160, boxW);
  ctx.fillRect(left, top - labelH - 4, labelW, labelH);

  // Accent hairline
  ctx.fillStyle = themeColor;
  ctx.fillRect(left, top - labelH - 4, 3, labelH);

  // Typography for HUD
  ctx.font = "600 13px -apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', sans-serif";
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.fillText(label.toUpperCase(), left + 10, top - 18);

  ctx.font = "500 11px -apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', sans-serif";
  ctx.fillStyle = themeColor;
  ctx.fillText(`${Math.min(100, Math.max(0, confidence)).toFixed(0)}% MATCH`, left + 10, top - 7);

  ctx.restore();
}

// Draw skeletal hand landmarks on canvas
export function drawHandLandmarksOnCanvas(
  ctx: CanvasRenderingContext2D,
  landmarks: Point3D[],
  width: number,
  height: number,
  isMirrored = true,
  color = "#10B981"
) {
  if (!landmarks || landmarks.length === 0) return;

  const CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8], // Index
    [0, 9], [9, 10], [10, 11], [11, 12], // Middle
    [0, 13], [13, 14], [14, 15], [15, 16], // Ring
    [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
    [5, 9], [9, 13], [13, 17], // Palm arch
  ];

  const getScreenX = (normX: number) => (isMirrored ? (1 - normX) * width : normX * width);
  const getScreenY = (normY: number) => normY * height;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Draw bone vectors
  for (const [i, j] of CONNECTIONS) {
    const p1 = landmarks[i];
    const p2 = landmarks[j];
    if (p1 && p2) {
      ctx.beginPath();
      ctx.moveTo(getScreenX(p1.x), getScreenY(p1.y));
      ctx.lineTo(getScreenX(p2.x), getScreenY(p2.y));
      ctx.stroke();
    }
  }

  // Draw joints
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
    const isKnuckle = i === 0 || i === 5 || i === 9 || i === 13 || i === 17;

    ctx.beginPath();
    ctx.arc(getScreenX(lm.x), getScreenY(lm.y), isTip ? 5.5 : isKnuckle ? 4.5 : 3, 0, 2 * Math.PI);
    ctx.fillStyle = isTip ? "#FFFFFF" : color;
    ctx.fill();
    ctx.strokeStyle = isTip ? color : "#000000";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.restore();
}

// Comprehensive realistic synthetic landmarks generator for offline/simulator mode
export function generateSyntheticLandmarks(target: string, time = Date.now()): Point3D[] {
  const t = time / 1000;
  const wobbleX = Math.sin(t * 2) * 0.006;
  const wobbleY = Math.cos(t * 2) * 0.006;

  const wrist: Point3D = { x: 0.5 + wobbleX, y: 0.74 + wobbleY, z: 0 };
  const upper = target.toUpperCase().trim();

  let indexExt = 0.25;
  let middleExt = 0.25;
  let ringExt = 0.25;
  let pinkyExt = 0.25;
  let thumbX = 0.42;
  let thumbY = 0.55;
  let indexOffsetX = 0;
  let middleOffsetX = 0;
  let pinkyOffsetX = 0;
  let pinkyOffsetY = 0;

  if (upper === "A" || upper === "E" || upper === "S" || upper === "M" || upper === "N" || upper === "T") {
    indexExt = 0.02;
    middleExt = 0.02;
    ringExt = 0.02;
    pinkyExt = 0.02;
    thumbX = upper === "A" ? 0.36 : 0.48;
    thumbY = upper === "A" ? 0.52 : 0.58;
  } else if (upper === "B") {
    indexExt = 0.26;
    middleExt = 0.26;
    ringExt = 0.26;
    pinkyExt = 0.26;
    thumbX = 0.46;
  } else if (upper === "L") {
    indexExt = 0.26;
    middleExt = 0.02;
    ringExt = 0.02;
    pinkyExt = 0.02;
    thumbX = 0.30;
    thumbY = 0.60;
  } else if (upper === "U") {
    indexExt = 0.26;
    middleExt = 0.26;
    ringExt = 0.02;
    pinkyExt = 0.02;
    thumbX = 0.48;
    indexOffsetX = 0.01;
    middleOffsetX = -0.01;
  } else if (upper === "V" || upper === "PEACE") {
    indexExt = 0.26;
    middleExt = 0.26;
    ringExt = 0.02;
    pinkyExt = 0.02;
    thumbX = 0.48;
    indexOffsetX = -0.04;
    middleOffsetX = 0.04;
  } else if (upper === "W") {
    indexExt = 0.26;
    middleExt = 0.26;
    ringExt = 0.26;
    pinkyExt = 0.02;
    thumbX = 0.48;
  } else if (upper === "I") {
    indexExt = 0.02;
    middleExt = 0.02;
    ringExt = 0.02;
    pinkyExt = 0.26;
    thumbX = 0.46;
  } else if (upper === "J") {
    indexExt = 0.02;
    middleExt = 0.02;
    ringExt = 0.02;
    pinkyExt = 0.26;
    thumbX = 0.46;
    pinkyOffsetX = Math.sin(t * 3) * 0.03;
    pinkyOffsetY = Math.cos(t * 3) * 0.02;
  } else if (upper === "K") {
    indexExt = 0.26;
    middleExt = 0.26;
    ringExt = 0.02;
    pinkyExt = 0.02;
    thumbX = 0.46;
    indexOffsetX = -0.02;
    middleOffsetX = 0.02;
  } else if (upper === "Y") {
    indexExt = 0.02;
    middleExt = 0.02;
    ringExt = 0.02;
    pinkyExt = 0.26;
    thumbX = 0.30;
  } else if (upper === "C" || upper === "O") {
    indexExt = 0.12;
    middleExt = 0.12;
    ringExt = 0.12;
    pinkyExt = 0.12;
    thumbX = 0.42;
  } else if (upper === "D") {
    indexExt = 0.26;
    middleExt = 0.04;
    ringExt = 0.04;
    pinkyExt = 0.02;
    thumbX = 0.46;
  } else if (upper === "F") {
    indexExt = 0.04;
    middleExt = 0.26;
    ringExt = 0.26;
    pinkyExt = 0.26;
    thumbX = 0.44;
  } else if (upper === "G" || upper === "H" || upper === "P" || upper === "Q") {
    indexExt = 0.26;
    middleExt = upper === "H" || upper === "P" ? 0.26 : 0.02;
    ringExt = 0.02;
    pinkyExt = 0.02;
    thumbX = 0.42;
  } else if (upper === "R") {
    indexExt = 0.26;
    middleExt = 0.26;
    ringExt = 0.02;
    pinkyExt = 0.02;
    thumbX = 0.46;
    indexOffsetX = 0.045;
    middleOffsetX = -0.045;
  } else if (upper === "X") {
    indexExt = 0.12;
    middleExt = 0.02;
    ringExt = 0.02;
    pinkyExt = 0.02;
    thumbX = 0.46;
  } else if (upper === "Z") {
    indexExt = 0.26;
    middleExt = 0.02;
    ringExt = 0.02;
    pinkyExt = 0.02;
    thumbX = 0.46;
  } else if (upper === "I LOVE YOU") {
    indexExt = 0.26;
    middleExt = 0.02;
    ringExt = 0.02;
    pinkyExt = 0.26;
    thumbX = 0.30;
    thumbY = 0.60;
  } else if (upper === "HELLO" || upper === "HI") {
    indexExt = 0.26;
    middleExt = 0.26;
    ringExt = 0.26;
    pinkyExt = 0.26;
    thumbX = 0.32;
    indexOffsetX = -0.03;
    middleOffsetX = 0.03;
    pinkyOffsetX = 0.04;
  } else if (upper === "THANK YOU" || upper === "PLEASE") {
    indexExt = 0.26;
    middleExt = 0.26;
    ringExt = 0.26;
    pinkyExt = 0.26;
    thumbX = 0.46;
  } else if (upper === "YES") {
    indexExt = 0.02;
    middleExt = 0.02;
    ringExt = 0.02;
    pinkyExt = 0.02;
    thumbX = 0.46;
  } else if (upper === "HELP") {
    indexExt = 0.02;
    middleExt = 0.02;
    ringExt = 0.02;
    pinkyExt = 0.02;
    thumbX = 0.32;
    thumbY = 0.45;
  } else if (upper === "OK") {
    indexExt = 0.04;
    middleExt = 0.26;
    ringExt = 0.26;
    pinkyExt = 0.26;
    thumbX = 0.44;
  }

  return [
    wrist,
    { x: 0.46 + wobbleX, y: 0.68 + wobbleY, z: -0.02 },
    { x: 0.42 + wobbleX, y: 0.62 + wobbleY, z: -0.03 },
    { x: 0.38 + wobbleX, y: 0.58 + wobbleY, z: -0.04 },
    { x: thumbX + wobbleX, y: thumbY + wobbleY, z: -0.05 },

    { x: 0.46 + wobbleX, y: 0.58 + wobbleY, z: -0.02 },
    { x: 0.46 + wobbleX, y: 0.50 + wobbleY, z: -0.03 },
    { x: 0.46 + wobbleX, y: 0.42 + wobbleY, z: -0.04 },
    { x: 0.46 + indexOffsetX + wobbleX, y: 0.58 - indexExt + wobbleY, z: -0.05 },

    { x: 0.50 + wobbleX, y: 0.58 + wobbleY, z: -0.02 },
    { x: 0.50 + wobbleX, y: 0.50 + wobbleY, z: -0.03 },
    { x: 0.50 + wobbleX, y: 0.42 + wobbleY, z: -0.04 },
    { x: 0.50 + middleOffsetX + wobbleX, y: 0.58 - middleExt + wobbleY, z: -0.05 },

    { x: 0.54 + wobbleX, y: 0.58 + wobbleY, z: -0.02 },
    { x: 0.54 + wobbleX, y: 0.50 + wobbleY, z: -0.03 },
    { x: 0.54 + wobbleX, y: 0.42 + wobbleY, z: -0.04 },
    { x: 0.54 + wobbleX, y: 0.58 - ringExt + wobbleY, z: -0.05 },

    { x: 0.58 + wobbleX, y: 0.60 + wobbleY, z: -0.02 },
    { x: 0.58 + wobbleX, y: 0.53 + wobbleY, z: -0.03 },
    { x: 0.58 + wobbleX, y: 0.46 + wobbleY, z: -0.04 },
    { x: 0.58 + pinkyOffsetX + wobbleX, y: 0.60 - pinkyExt + pinkyOffsetY + wobbleY, z: -0.05 },
  ];
}
