// utils/geminiClient.js
const fetch = global.fetch || require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'; // replace with supported model

async function callGemini(promptText, opts = {}) {
  const temperature = typeof opts.temperature === 'number' ? opts.temperature : 0.2;
  const maxOutputTokens = typeof opts.maxOutputTokens === 'number' ? opts.maxOutputTokens : 800;

  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');

  // Use v1 endpoint (not v1beta)
  const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const body = {
    contents: [{ parts: [{ text: promptText }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const rawText = await resp.text();

  let parsedJson = null;
  try { parsedJson = JSON.parse(rawText); } catch {}

  if (resp.status !== 200) {
    console.error('Gemini API error:', resp.status, parsedJson ?? rawText);
    throw new Error(`Gemini API error ${resp.status}`);
  }

  let textOutput = null;
  if (parsedJson?.candidates?.[0]?.content?.parts?.[0]?.text) {
    textOutput = parsedJson.candidates[0].content.parts[0].text;
  }

  if (!textOutput) textOutput = rawText; // fallback
  return { text: textOutput, raw: parsedJson ?? rawText, status: resp.status };
}

module.exports = { callGemini };
