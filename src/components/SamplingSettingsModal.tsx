import React from "react";
import { X, Sliders, Palette, Camera, Volume2, FastForward, Check } from "lucide-react";
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
            <h3 className="font-serif text-lg font-bold text-[#1A1A1A]">Neural ML & Camera Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#888] hover:text-black transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5 text-xs">
          
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
                <span className="text-[10px] text-[#777]">Progress to next letter when posture matches</span>
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
