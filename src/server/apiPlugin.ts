import type { Plugin } from "vite";
import express from "express";
import { generateSignSubtext, chatWithMentor, analyzeFrameGesture, enhanceSentenceGrammar, translateEnglishToSign } from "./geminiService";

export function apiPlugin(): Plugin {
  return {
    name: "aidsl-api-plugin",
    configureServer(server) {
      const app = express();
      app.use(express.json({ limit: "10mb" }));

      app.post("/api/subtext", async (req, res) => {
        try {
          const { letter, wordContext, apiKey } = req.body || {};
          if (!letter) {
            return res.status(400).json({ error: "Letter is required" });
          }
          const subtext = await generateSignSubtext(letter, wordContext, apiKey);
          res.json({ subtext });
        } catch (err) {
          res.status(500).json({ error: "Failed to generate subtext" });
        }
      });

      app.post("/api/chat", async (req, res) => {
        try {
          const { messages, apiKey } = req.body || {};
          if (!Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: "Messages array required" });
          }
          const reply = await chatWithMentor(messages, apiKey);
          res.json({ reply });
        } catch (err) {
          res.status(500).json({ error: "Failed to process mentor chat" });
        }
      });

      app.post("/api/analyze-frame", async (req, res) => {
        try {
          const { base64Image, targetLetter, apiKey } = req.body || {};
          if (!base64Image || !targetLetter) {
            return res.status(400).json({ error: "Missing image or target letter" });
          }
          const result = await analyzeFrameGesture(base64Image, targetLetter, apiKey);
          res.json(result);
        } catch (err) {
          res.status(500).json({ error: "Failed to analyze frame" });
        }
      });

      app.post("/api/enhance-sentence", async (req, res) => {
        try {
          const { rawSentence, apiKey } = req.body || {};
          if (!rawSentence) {
            return res.status(400).json({ error: "rawSentence is required" });
          }
          const enhanced = await enhanceSentenceGrammar(rawSentence, apiKey);
          res.json({ enhanced });
        } catch (err) {
          res.status(500).json({ error: "Failed to enhance sentence grammar" });
        }
      });

      app.post("/api/english-to-sign", async (req, res) => {
        try {
          const { englishText, apiKey } = req.body || {};
          if (!englishText) {
            return res.status(400).json({ error: "englishText is required" });
          }
          const result = await translateEnglishToSign(englishText, apiKey);
          res.json(result);
        } catch (err) {
          res.status(500).json({ error: "Failed to translate English to Sign" });
        }
      });

      server.middlewares.use(app);
    },
  };
}
