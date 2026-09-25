import React, { useState } from "react";
import { Award, CheckCircle2, Flame, BarChart2, ArrowUpRight, Camera, Search, Trophy, Target, Zap } from "lucide-react";
import { ASL_ALPHABET, ASL_PHRASES } from "../data/aslAlphabet";
import { PracticeStats } from "../types/sign";

interface LearningDashboardProps {
  stats: PracticeStats;
  onPracticeLetter: (letter: string) => void;
}

export const LearningDashboard: React.FC<LearningDashboardProps> = ({
  stats,
  onPracticeLetter,
}) => {
  const [activeTab, setActiveTab] = useState<"matrix" | "phrases" | "resources">("matrix");
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("All");

  const lettersArray = Object.values(ASL_ALPHABET);

  const filteredLetters = lettersArray.filter((item) => {
    const matchesSearch = item.letter.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDiff = difficultyFilter === "All" || item.difficulty === difficultyFilter;
    return matchesSearch && matchesDiff;
  });

  const EXTERNAL_RESOURCES = [
    {
      title: "ASL University (Lifeprint)",
      description: "Dr. Bill Vicars' comprehensive free American Sign Language curriculum, video lessons, and fingerspelling drills.",
      url: "https://www.lifeprint.com/",
      category: "Free Curriculum",
    },
    {
      title: "Handspeak ASL Dictionary",
      description: "Authoritative video dictionary, grammar lessons, Deaf culture essays, and linguistic terminology guides.",
      url: "https://www.handspeak.com/",
      category: "Video Dictionary",
    },
    {
      title: "Gallaudet University ASL Connect",
      description: "Official interactive online sign language modules from the premier world university for Deaf education.",
      url: "https://gallaudet.edu/asl-connect/",
      category: "Academic",
    },
    {
      title: "National Association of the Deaf (NAD)",
      description: "Civil rights advocacy, accessibility policy, Deaf community events, and youth educational resources.",
      url: "https://www.nad.org/",
      category: "Advocacy & Culture",
    },
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-8 space-y-6 text-[#1A1A1A]">
      
      {/* Editorial Header */}
      <div className="border-b border-[#D1D1D1] pb-4">
        <span className="text-[10px] uppercase font-mono tracking-widest text-[#888] block">
          Academy & Curriculum
        </span>
        <h1 className="text-3xl font-serif font-black tracking-tight text-[#1A1A1A]">
          ASL Manual Matrix & Reference Library
        </h1>
        <p className="text-xs text-[#666] mt-0.5 max-w-xl">
          Complete structural guide to American Sign Language manual alphabet, foundational phrase gestures, and accredited external portals.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-[#D1D1D1] flex items-center gap-8">
        <button
          onClick={() => setActiveTab("matrix")}
          className={`pb-3 text-xs uppercase tracking-[0.18em] font-bold transition-colors cursor-pointer border-b-2 ${
            activeTab === "matrix"
              ? "border-black text-black"
              : "border-transparent text-[#888] hover:text-black"
          }`}
        >
          Mastery Matrix (A-Z)
        </button>

        <button
          onClick={() => setActiveTab("phrases")}
          className={`pb-3 text-xs uppercase tracking-[0.18em] font-bold transition-colors cursor-pointer border-b-2 ${
            activeTab === "phrases"
              ? "border-black text-black"
              : "border-transparent text-[#888] hover:text-black"
          }`}
        >
          Phrase Repertoire
        </button>

        <button
          onClick={() => setActiveTab("resources")}
          className={`pb-3 text-xs uppercase tracking-[0.18em] font-bold transition-colors cursor-pointer border-b-2 ${
            activeTab === "resources"
              ? "border-black text-black"
              : "border-transparent text-[#888] hover:text-black"
          }`}
        >
          Curriculum & Portals
        </button>
      </div>

      {/* Tab 1: Alphabet Matrix */}
      {activeTab === "matrix" && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#888] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search letter, knuckle alignment..."
                className="w-full bg-white border border-[#D1D1D1] pl-9 pr-4 py-2 text-xs font-mono text-[#1A1A1A] focus:border-black focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-[#EAE8E2] p-1 border border-[#D1D1D1]">
              {["All", "Beginner", "Intermediate"].map((level) => (
                <button
                  key={level}
                  onClick={() => setDifficultyFilter(level)}
                  className={`px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    difficultyFilter === level
                      ? "bg-white text-black font-semibold shadow-xs"
                      : "text-[#666] hover:text-black"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Letter Matrix Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLetters.map((item, idx) => {
              const isMastered = idx < stats.lettersMastered;
              return (
                <div
                  key={item.letter}
                  className="p-5 bg-white border border-[#D1D1D1] hover:border-black transition-all flex flex-col justify-between space-y-3 shadow-xs group"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 bg-[#FAF9F5] border border-black flex items-center justify-center font-serif text-3xl font-black text-black group-hover:bg-black group-hover:text-white transition-colors shrink-0 shadow-inner">
                          {item.letter}
                        </div>
                        <div>
                          <h4 className="font-serif text-base font-bold text-[#1A1A1A]">{item.title}</h4>
                          <span className="text-[10px] font-mono text-[#888] uppercase tracking-wider">{item.difficulty}</span>
                        </div>
                      </div>

                      {isMastered ? (
                        <span className="text-emerald-700 bg-emerald-50 text-[10px] font-mono font-bold px-2 py-0.5 border border-emerald-200">
                          Mastered
                        </span>
                      ) : (
                        <span className="text-[#888] text-[10px] font-mono">
                          In Progress
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[#555] leading-relaxed mt-3">
                      {item.description}
                    </p>

                    <div className="bg-[#FAF9F5] p-2.5 border-l-2 border-black text-[11px] text-[#444] mt-3">
                      <span className="font-semibold block mb-0.5">Instruction:</span>
                      {item.geminiSubtext}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#EAE8E2] flex items-center justify-between">
                    <span className="text-[10px] font-mono text-[#888]">
                      Thumb: {item.fingerState.thumb}
                    </span>

                    <button
                      onClick={() => onPracticeLetter(item.letter)}
                      className="py-1.5 px-3 bg-black text-white font-mono text-[10px] uppercase tracking-wider font-semibold hover:bg-neutral-800 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Camera size={12} />
                      <span>Practice</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Essential Phrases */}
      {activeTab === "phrases" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ASL_PHRASES.map((phrase) => (
            <div key={phrase.id} className="p-6 bg-white border border-[#D1D1D1] space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#D1D1D1] pb-3">
                <h3 className="font-serif text-2xl font-bold text-[#1A1A1A]">"{phrase.phrase}"</h3>
                <span className="text-[10px] font-mono font-bold text-black border border-black px-2 py-0.5 uppercase">
                  {phrase.category}
                </span>
              </div>

              <p className="text-xs text-[#1A1A1A] leading-relaxed">
                <strong className="font-bold">Biomechanics:</strong> {phrase.translation}
              </p>

              <div className="bg-[#FAF9F5] p-3 border-l-2 border-black text-xs text-[#666]">
                {phrase.explanation}
              </div>

              <div className="pt-3 border-t border-[#D1D1D1] flex items-center justify-between">
                <div className="flex items-center gap-1">
                  {phrase.letters.slice(0, 6).map((char, idx) => (
                    <span key={idx} className="w-6 h-7 bg-[#ECEAE4] text-xs font-mono font-bold text-black flex items-center justify-center">
                      {char}
                    </span>
                  ))}
                </div>

                <button
                  onClick={() => onPracticeLetter(phrase.phrase)}
                  className="text-xs font-bold text-black hover:text-emerald-700 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Camera size={13} /> Practice
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: External Portals */}
      {activeTab === "resources" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {EXTERNAL_RESOURCES.map((res, idx) => (
            <a
              key={idx}
              href={res.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-6 bg-white border border-[#D1D1D1] hover:border-black transition-all group space-y-3 block shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-black font-bold border border-black px-2 py-0.5 uppercase">
                  {res.category}
                </span>
                <ArrowUpRight className="w-4 h-4 text-[#888] group-hover:text-black transition-colors" />
              </div>

              <h3 className="font-serif text-2xl font-bold text-[#1A1A1A] group-hover:underline">
                {res.title}
              </h3>

              <p className="text-xs text-[#555] leading-relaxed">
                {res.description}
              </p>
            </a>
          ))}
        </div>
      )}

    </div>
  );
};
