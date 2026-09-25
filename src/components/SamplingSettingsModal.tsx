import React, { useState } from "react";
import { X, Sliders, Palette, Check, Key, Eye, EyeOff, Sparkles, ExternalLink } from "lucide-react";
import { SamplingSettings } from "../types/sign";

interface SamplingSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SamplingSettings;
  onUpdateSettings: (newSettings: SamplingSettings) => void;
}

export const SamplingSettingsModal: React.FC<SamplingSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  const [showApiKey, setShowApiKey] = useState(false);

  if (!isOpen) return null;

  const handleChange = <K extends keyof SamplingSettings>(
    key: K,
    value: SamplingSettings[K]
  ) => {
    onUpdateSettings({ ...settings, [key]: value });
  };

  const HUD_THEMES = [
    { id: "emerald", label: "Emerald Laser", color: "#10B981" },
    { id: "cyan", label: "Cyber Cyan", color: "#06B6D4" },
    { id: "amber", label: "Amber Neon", color: "#F59E0B" },
    { id: "monochrome", label: "Pure White", color: "#FFFFFF" },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#D1D1D1] max-w-md w-full p-6 shadow-2xl space-y-6 text-[#1A1A1A] relative max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#D1D1D1] pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-black" />
            <h3 className="font-serif text-lg font-bold text-[#1A1A1A]">Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#888] hover:text-black transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5 text-xs">
          
          {/* Gemini API Key Section */}
          <div className="bg-[#FAF9F5] border border-[#D1D1D1] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[#1A1A1A] font-bold uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-black" />
                <span>Gemini API Key</span>
              </label>

              {settings.geminiApiKey?.trim() ? (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-mono font-bold px-2 py-0.5 border border-emerald-300">
                  Key Configured
                </span>
              ) : (
                <span className="text-[10px] text-[#888] font-mono">
                  Optional (Fallback offline)
                </span>
              )}
            </div>

            <p className="text-[11px] text-[#666] leading-relaxed">
              Add your personal Gemini API key to power AI vision analysis, custom feedback, and mentor responses.
            </p>

            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={settings.geminiApiKey || ""}
                onChange={(e) => handleChange("geminiApiKey", e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-white border border-[#D1D1D1] p-2.5 pr-10 text-xs font-mono text-[#1A1A1A] focus:outline-none focus:border-black"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#888] hover:text-black p-1 cursor-pointer transition-colors"
                title={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-[#777]">
              <span>Key is stored locally in your browser</span>
              {settings.geminiApiKey && (
                <button
                  type="button"
                  onClick={() => handleChange("geminiApiKey", "")}
                  className="text-red-600 hover:underline cursor-pointer"
                >
                  Clear key
                </button>
              )}
            </div>
          </div>

          {/* HUD Color Scheme */}
          <div className="space-y-2">
            <label className="text-[#1A1A1A] font-bold uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5" />
              <span>Skeleton HUD Color Theme</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {HUD_THEMES.map((theme) => {
                const isSelected = (settings.hudTheme || "emerald") === theme.id;
                return (
                  <button
                    key={theme.id}
                    onClick={() => handleChange("hudTheme", theme.id)}
                    className={`p-2.5 border flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? "border-black bg-black text-white font-semibold"
                        : "border-[#D1D1D1] bg-[#FAF9F5] text-[#333] hover:border-black"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full border border-black/20"
                        style={{ backgroundColor: theme.color }}
                      />
                      <span className="font-mono text-[11px]">{theme.label}</span>
                    </div>
                    {isSelected && <Check size={13} className="text-emerald-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Confidence Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between font-mono">
              <span className="text-[#1A1A1A] font-bold uppercase tracking-wider">Detection Sensitivity</span>
              <span className="text-black font-bold">{settings.confidenceThreshold}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="95"
              step="1"
              value={settings.confidenceThreshold}
              onChange={(e) => handleChange("confidenceThreshold", Number(e.target.value))}
              className="w-full accent-black cursor-pointer"
            />
            <p className="text-[10px] text-[#777]">
              Higher values ensure strict knuckle and finger posture matching before accepting.
            </p>
          </div>

          {/* Toggle Switches */}
          <div className="space-y-3 pt-2 border-t border-[#EAE8E2]">
            <label className="flex items-center justify-between cursor-pointer p-1">
              <div>
                <span className="font-bold text-xs block">Draw Landmark Skeleton</span>
                <span className="text-[10px] text-[#777]">Show real-time bone vectors and joint nodes</span>
              </div>
              <input
                type="checkbox"
                checked={settings.showSkeleton}
                onChange={(e) => handleChange("showSkeleton", e.target.checked)}
                className="w-4 h-4 accent-black cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer p-1">
              <div>
                <span className="font-bold text-xs block">Mirror Camera Stream</span>
                <span className="text-[10px] text-[#777]">Natural selfie view orientation</span>
              </div>
              <input
                type="checkbox"
                checked={settings.mirrorCamera}
                onChange={(e) => handleChange("mirrorCamera", e.target.checked)}
                className="w-4 h-4 accent-black cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer p-1">
              <div>
                <span className="font-bold text-xs block">Auto-Advance on Sign Hold</span>
                <span className="text-[10px] text-[#777]">Progress to next letter when live posture matches</span>
              </div>
              <input
                type="checkbox"
                checked={settings.autoAdvance}
                onChange={(e) => handleChange("autoAdvance", e.target.checked)}
                className="w-4 h-4 accent-black cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer p-1">
              <div>
                <span className="font-bold text-xs block">Tactile Audio Feedback & Speech</span>
                <span className="text-[10px] text-[#777]">Chimes and pronunciation readouts</span>
              </div>
              <input
                type="checkbox"
                checked={settings.audioFeedback}
                onChange={(e) => handleChange("audioFeedback", e.target.checked)}
                className="w-4 h-4 accent-black cursor-pointer"
              />
            </label>
          </div>

        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[#D1D1D1] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            Save & Close
          </button>
        </div>

      </div>
    </div>
  );
};
