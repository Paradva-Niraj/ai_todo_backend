const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Todo = require('../models/todos');
const { callGemini } = require('../utils/geminiClient');
const { offsetDate } = require('../utils/date_helper_server');
const rateLimit = require('express-rate-limit');

// Simple rate-limiter for AI endpoints
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 6,
  message: { ok: false, error: 'Too many AI requests, try again later' },
});
router.use(aiLimiter);

// Helper: safely parse JSON returned by AI
function safeJsonParse(text) {
  if (!text) return null;
  // Remove markdown code fences (```json ... ```)
  const clean = text.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
  try {
    const match = clean.match(/\{[\s\S]*\}/); 
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// POST /api/ai/assist
router.post('/assist', auth, async (req, res) => {
  try {
    const { prompt, date } = req.body;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
      return res.status(400).json({ ok: false, error: 'Prompt is required' });
    }

    // 1️⃣ Fetch tasks from DB for the given date (or today)
    let taskContext = '';
    if (date) {
      const start = new Date(date);
      start.setHours(0,0,0,0);
      const end = new Date(date);
      end.setHours(23,59,59,999);

      const todos = await Todo.find({
        user: req.user.id,
        date: { $gte: start, $lte: end },
      }).lean();

      if (todos.length > 0) {
        taskContext = 'Tasks for the requested date:\n';
        todos.forEach((t, idx) => {
          taskContext += `${idx + 1}. ${t.title} - ${t.description || 'No description'}\n`;
        });
      } else {
        taskContext = 'You have no tasks for the requested date.\n';
      }
    }

    // 2️⃣ Build AI prompt combining project breakdown + DB tasks
    const systemPrompt = `
You are an AI assistant integrated with a todo app.

Requirements:
- ALWAYS respond with strict JSON ONLY with these root keys:
  - "summary": string (short paragraph),
  - "suggestedTasks": array of task objects (can be empty),
  - "importantPastTasks": array of { title, reason } (can be empty).
- DO NOT include Markdown, explanations, or extra text outside JSON.
- Each suggested task must have:
  - title (string)
  - description (string, 1-2 sentences)
  - priority (low, medium, high, critical)
  - relativeDayOffset (0=today, negative=past, positive=future)
  - time (optional HH:mm 24h)
  - tags (optional array of strings)
  - categoryId (optional string)

Use the following context if available:
${taskContext}

User request:
"""${prompt}"""
`;

    const aiResp = await callGemini(systemPrompt);

    if (!aiResp || !aiResp.text) {
      console.error('AI returned no valid response:', aiResp.raw);
      return res.status(500).json({
        ok: false,
        error: 'Gemini API returned no response',
        raw: aiResp.raw,
      });
    }

    const rawText = aiResp.text;

    // 3️⃣ Parse JSON safely
    const parsed = safeJsonParse(rawText);
    if (!parsed) {
      console.error('AI returned invalid JSON:', rawText);
      return res.status(500).json({ ok: false, error: 'AI returned invalid JSON', raw: rawText });
    }

    // 4️⃣ Ensure consistent structure
    parsed.summary = parsed.summary || '';
    parsed.suggestedTasks = Array.isArray(parsed.suggestedTasks) ? parsed.suggestedTasks : [];
    parsed.importantPastTasks = Array.isArray(parsed.importantPastTasks) ? parsed.importantPastTasks : [];

    return res.json({ ok: true, data: parsed, raw: rawText });

  } catch (err) {
    console.error('AI assist error:', err);
    return res.status(500).json({ ok: false, error: 'Server error while contacting AI' });
  }
});

module.exports = router;
