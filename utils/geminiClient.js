// utils/geminiClient.js - Enforced JSON mode
const fetch = global.fetch || require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';

async function callGemini(promptText, opts = {}) {
  const temperature = typeof opts.temperature === 'number' ? opts.temperature : 0.2;
  const maxOutputTokens = typeof opts.maxOutputTokens === 'number' ? opts.maxOutputTokens : 1500;

  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set in environment variables');
  }

  const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  // Add JSON schema constraint for Gemini 2.0+
  const body = {
    contents: [{ 
      parts: [{ text: promptText }] 
    }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      // responseMimeType: "application/json", // Force JSON response
    },
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const rawText = await resp.text();
    let parsedJson = null;
    
    try { 
      parsedJson = JSON.parse(rawText); 
    } catch (parseErr) {
      console.error('Failed to parse Gemini response as JSON:', parseErr.message);
    }

    if (resp.status !== 200) {
      console.error('Gemini API error:', resp.status, parsedJson ?? rawText.substring(0, 200));
      throw new Error(`Gemini API error ${resp.status}`);
    }

    let textOutput = null;
    if (parsedJson?.candidates?.[0]?.content?.parts?.[0]?.text) {
      textOutput = parsedJson.candidates[0].content.parts[0].text;
    }

    if (!textOutput) {
      console.error('No text in Gemini response');
      textOutput = rawText;
    }

    return { 
      text: textOutput, 
      raw: parsedJson ?? rawText, 
      status: resp.status 
    };

  } catch (err) {
    console.error('Gemini API call failed:', err.message);
    throw err;
  }
}

module.exports = { callGemini };