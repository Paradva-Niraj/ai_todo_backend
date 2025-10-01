// routes/ai.js - Updated to use ChatGPT API
const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Todo = require('../models/todos');
// const { callChatGPT } = require('../utils/chatgptClient'); // Changed from geminiClient
const { callGemini } = require('../utils/geminiClient');
const { offsetDate } = require('../utils/date_helper_server');
const rateLimit = require('express-rate-limit');

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { ok: false, error: 'Too many AI requests. Please wait a moment.' },
  keyGenerator: (req) => req.user?.id || req.ip,
});
router.use(aiLimiter);

function validatePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { valid: false, error: 'Prompt is required' };
  }

  const cleaned = prompt.trim();

  if (cleaned.length < 3) {
    return { valid: false, error: 'Prompt too short (minimum 3 characters)' };
  }

  if (cleaned.length > 2000) {
    return { valid: false, error: 'Prompt too long (maximum 2000 characters)' };
  }

  const repeatedChars = /(.){10,}/;
  if (repeatedChars.test(cleaned)) {
    return { valid: false, error: 'Invalid prompt format' };
  }

  const spamPatterns = [
    /^[^a-zA-Z0-9\s]+$/,
    /^\d+$/,
    /^(.)+$/,
  ];

  for (const pattern of spamPatterns) {
    if (pattern.test(cleaned)) {
      return { valid: false, error: 'Please provide a meaningful prompt' };
    }
  }

  return { valid: true, cleaned };
}

// IMPROVED: More aggressive JSON extraction
function safeJsonParse(text) {
  if (!text) return null;

  try {
    // ChatGPT with JSON mode should return clean JSON, but let's be safe
    let clean = text.trim();

    // Remove any potential markdown if present
    clean = clean
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    // Find JSON object
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON object found in AI response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate structure
    if (typeof parsed !== 'object') {
      console.error('Parsed result is not an object');
      return null;
    }

    // Ensure arrays are arrays with better validation
    const arrayFields = ['suggestedTasks', 'highlights', 'warnings', 'insights', 'priorityOrder'];
    arrayFields.forEach(field => {
      if (parsed[field] && !Array.isArray(parsed[field])) {
        console.warn(`${field} is not an array, converting...`);
        parsed[field] = [];
      }
    });

    return parsed;
  } catch (err) {
    console.error('JSON parse error:', err.message);
    console.error('Attempted to parse:', text.substring(0, 200));
    return null;
  }
}

async function getUserTaskContext(userId, days = 7) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days);

  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + days);

  const todos = await Todo.find({
    user: userId,
    $or: [
      { date: { $gte: startDate, $lte: endDate } },
      { type: 'recurring' },
      { type: 'schedule-block' }
    ]
  }).sort({ date: 1, priority: -1 }).lean();

  return todos;
}

function formatTasksForAI(todos) {
  if (todos.length === 0) return 'No tasks found.';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const grouped = {
    overdue: [],
    today: [],
    upcoming: [],
    recurring: [],
    scheduleBlocks: []
  };

  todos.forEach(t => {
    if (t.type === 'schedule-block') {
      grouped.scheduleBlocks.push(t);
      return;
    }

    if (t.type === 'recurring') {
      grouped.recurring.push(t);
      return;
    }

    if (!t.date) {
      grouped.upcoming.push(t);
      return;
    }

    const taskDate = new Date(t.date);
    taskDate.setHours(0, 0, 0, 0);

    if (taskDate < today && !t.completed) {
      grouped.overdue.push(t);
    } else if (taskDate.getTime() === today.getTime()) {
      grouped.today.push(t);
    } else {
      grouped.upcoming.push(t);
    }
  });

  let context = '';

  if (grouped.overdue.length > 0) {
    context += `OVERDUE TASKS: ${grouped.overdue.length}\n`;
    grouped.overdue.slice(0, 5).forEach((t, i) => {
      const daysOverdue = Math.floor((today - new Date(t.date)) / (1000 * 60 * 60 * 24));
      context += `${i + 1}. ${t.title} (${daysOverdue}d overdue)\n`;
    });
    context += '\n';
  }

  if (grouped.today.length > 0) {
    context += `TODAY'S TASKS: ${grouped.today.length}\n`;
    grouped.today.forEach((t, i) => {
      context += `${i + 1}. ${t.title}`;
      if (t.time) context += ` at ${t.time}`;
      if (t.completed) context += ` (completed)`;
      context += `\n`;
    });
    context += '\n';
  }

  if (grouped.upcoming.length > 0) {
    context += `UPCOMING TASKS: ${grouped.upcoming.length}\n`;
    grouped.upcoming.slice(0, 5).forEach((t, i) => {
      const dateStr = t.date ? new Date(t.date).toISOString().split('T')[0] : 'no date';
      context += `${i + 1}. ${t.title} - ${dateStr}\n`;
    });
    context += '\n';
  }

  return context || 'No tasks found.';
}

router.post('/assist', auth, async (req, res) => {
  try {
    const { prompt, mode } = req.body;

    const validation = validatePrompt(prompt);
    if (!validation.valid) {
      return res.status(400).json({ ok: false, error: validation.error });
    }

    const cleanPrompt = validation.cleaned;
    const todos = await getUserTaskContext(req.user.id, 14);
    const taskContext = formatTasksForAI(todos);

    const detectedMode = mode || detectPromptIntent(cleanPrompt);

    let systemPrompt = '';
    switch (detectedMode) {
      case 'summary':
        systemPrompt = buildSummaryPrompt(taskContext, cleanPrompt);
        break;
      case 'create':
        systemPrompt = buildCreateTaskPrompt(taskContext, cleanPrompt);
        break;
      case 'prioritize':
        systemPrompt = buildPrioritizePrompt(taskContext, cleanPrompt);
        break;
      case 'analyze':
        systemPrompt = buildAnalyzePrompt(taskContext, cleanPrompt);
        break;
      default:
        systemPrompt = buildGeneralPrompt(taskContext, cleanPrompt);
    }

    console.log('AI Mode:', detectedMode);

    // Use ChatGPT instead of Gemini
    const aiResp = await callGemini(systemPrompt, { temperature: 0.2, maxOutputTokens: 1500, model: 'best-gemini-model' });


    if (!aiResp || !aiResp.text) {
      console.error('AI returned no response');
      return res.status(500).json({
        ok: false,
        error: 'AI service temporarily unavailable',
      });
    }

    const rawText = aiResp.text;
    console.log('AI Raw Response (first 300 chars):', rawText.substring(0, 300));

    let parsed = safeJsonParse(rawText);

    if (!parsed) {
      console.error('Failed to parse JSON, returning fallback');
      parsed = {
        summary: 'Unable to process AI response. Please try again.',
        suggestedTasks: [],
        advice: '',
        highlights: [],
        warnings: ['AI returned an invalid response format'],
        responseType: 'error'
      };
    }

    // Ensure all required fields exist with correct types
    const response = {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      advice: typeof parsed.advice === 'string' ? parsed.advice : '',
      suggestedTasks: Array.isArray(parsed.suggestedTasks) ? parsed.suggestedTasks : [],
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      insights: Array.isArray(parsed.insights) ? parsed.insights : [],
      priorityOrder: Array.isArray(parsed.priorityOrder) ? parsed.priorityOrder : [],
      responseType: detectedMode,
      meta: {
        mode: detectedMode,
        taskCount: todos.length,
        overdueCount: todos.filter(t => {
          if (!t.date || t.completed) return false;
          const taskDate = new Date(t.date);
          taskDate.setHours(0, 0, 0, 0);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return taskDate < today;
        }).length,
        todayCount: todos.filter(t => {
          if (!t.date) return false;
          const taskDate = new Date(t.date);
          const today = new Date();
          return taskDate.toDateString() === today.toDateString();
        }).length,
        usage: aiResp.usage // Include token usage info
      }
    };

    console.log('Sending response with', response.suggestedTasks.length, 'tasks');
    return res.json({ ok: true, data: response, raw: rawText.substring(0, 500) });

  } catch (err) {
    console.error('AI assist error:', err);
    return res.status(500).json({ 
      ok: false, 
      error: 'Server error while processing AI request' 
    });
  }
});

router.post('/commit', auth, async (req, res) => {
  try {
    const { tasks } = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ ok: false, error: 'Tasks array required' });
    }

    if (tasks.length > 20) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Maximum 20 tasks can be created at once' 
      });
    }

    const created = [];
    const errors = [];

    for (const task of tasks) {
      try {
        if (!task.title || task.title.trim().length === 0) {
          errors.push({ task, error: 'Title required' });
          continue;
        }

        const offset = parseInt(task.relativeDayOffset) || 0;
        const { normalizedUtc } = offsetDate(offset);

        const todoData = {
          user: req.user.id,
          title: task.title.trim(),
          description: task.description?.trim() || '',
          type: 'one-time',
          date: normalizedUtc,
          time: task.time || null,
          priority: ['low', 'medium', 'high', 'critical'].includes(task.priority) 
            ? task.priority 
            : 'medium',
          tags: Array.isArray(task.tags) ? task.tags : [],
          recurrence: { type: 'none' },
          createdByAI: true,
        };

        if (task.categoryId) {
          todoData.category = task.categoryId;
        }

        const todo = new Todo(todoData);
        await todo.save();
        created.push(todo);

      } catch (err) {
        console.error('Error creating task:', err);
        errors.push({ task, error: err.message });
      }
    }

    const response = {
      ok: true,
      createdCount: created.length,
      created: created.map(t => ({
        id: t._id,
        title: t.title,
        date: t.date
      })),
    };

    if (errors.length > 0) {
      response.errors = errors;
      response.message = `Created ${created.length} tasks, ${errors.length} failed`;
    } else {
      response.message = `Successfully created ${created.length} tasks`;
    }

    return res.json(response);

  } catch (err) {
    console.error('Commit tasks error:', err);
    return res.status(500).json({ 
      ok: false, 
      error: 'Server error while creating tasks' 
    });
  }
});

function detectPromptIntent(prompt) {
  const lower = prompt.toLowerCase();

  if (lower.match(/summar(y|ize)|overview|day|today|week/)) {
    return 'summary';
  }

  if (lower.match(/create|add|new|remind|schedule|plan/)) {
    return 'create';
  }

  if (lower.match(/priorit(y|ize)|important|urgent|focus|should.*do/)) {
    return 'prioritize';
  }

  if (lower.match(/analyz|pattern|trend|progress|productivity/)) {
    return 'analyze';
  }

  return 'general';
}

// OPTIMIZED FOR CHATGPT: More structured and clearer instructions
function buildSummaryPrompt(taskContext, userPrompt) {
  return `You are a task management AI assistant. Respond with ONLY a valid JSON object.

CURRENT TASKS:
${taskContext}

USER REQUEST: ${userPrompt}

Analyze the tasks and provide a summary. Return this exact JSON structure:

{
  "summary": "A 2-3 sentence overview of current workload and key insights",
  "advice": "2-3 sentences of actionable recommendations",
  "highlights": ["key insight 1", "key insight 2", "key insight 3"],
  "suggestedTasks": [],
  "warnings": ["warning about overload or conflicts if any"]
}

REQUIREMENTS:
- summary: Must be informative and concise
- advice: Must be actionable and helpful
- highlights: Array of 2-4 key points (strings only)
- suggestedTasks: Must be empty array []
- warnings: Array of warnings or empty array []
- All fields are required
- Use proper JSON formatting only`;
}

function buildCreateTaskPrompt(taskContext, userPrompt) {
  return `You are a task creation AI assistant. Respond with ONLY a valid JSON object.

EXISTING TASKS:
${taskContext}

USER REQUEST: ${userPrompt}

Create appropriate tasks based on the user's request. Return this exact JSON structure:

{
  "summary": "Brief description of what tasks are being created",
  "suggestedTasks": [
    {
      "title": "Clear, actionable task title (max 50 chars)",
      "description": "Brief 1-2 sentence description",
      "priority": "medium",
      "relativeDayOffset": 0,
      "time": null,
      "tags": []
    }
  ],
  "advice": "Brief advice about the created tasks",
  "highlights": [],
  "warnings": []
}

REQUIREMENTS:
- title: Clear, specific, actionable (max 50 characters)
- description: 1-2 sentences explaining the task
- priority: Must be exactly "low", "medium", "high", or "critical"
- relativeDayOffset: Integer (0=today, 1=tomorrow, -1=yesterday, etc.)
- time: Either "HH:MM" format or null
- tags: Array of relevant tags or empty array []
- Create 1-8 tasks maximum
- All other fields must be empty arrays or empty strings`;
}

function buildPrioritizePrompt(taskContext, userPrompt) {
  return `You are a task prioritization AI assistant. Respond with ONLY a valid JSON object.

CURRENT TASKS:
${taskContext}

USER REQUEST: ${userPrompt}

Analyze and prioritize the existing tasks. Return this exact JSON structure:

{
  "summary": "Brief analysis of current workload",
  "advice": "Specific recommendations for prioritization",
  "priorityOrder": [
    {
      "title": "Task name from the list",
      "reason": "Why this should be done first/next"
    }
  ],
  "suggestedTasks": [],
  "highlights": [],
  "warnings": []
}

REQUIREMENTS:
- summary: Brief workload analysis
- advice: Specific prioritization guidance
- priorityOrder: Array of task objects with title and reason
- Only reference tasks that actually exist in the task list
- Provide clear reasoning for priority decisions
- All other fields must be empty arrays`;
}

function buildAnalyzePrompt(taskContext, userPrompt) {
  return `You are a productivity analysis AI assistant. Respond with ONLY a valid JSON object.

TASKS DATA:
${taskContext}

USER REQUEST: ${userPrompt}

Analyze the task patterns and productivity. Return this exact JSON structure:

{
  "summary": "Key findings in 2-3 sentences",
  "insights": [
    {
      "type": "pattern",
      "description": "Specific insight about task patterns or productivity"
    }
  ],
  "advice": "Actionable recommendations based on analysis",
  "suggestedTasks": [],
  "highlights": [],
  "warnings": []
}

REQUIREMENTS:
- summary: Key analytical findings
- insights: Array of insight objects
- type: Must be exactly "pattern", "trend", or "issue"
- description: Specific, actionable insight
- advice: Concrete recommendations
- All other fields must be empty arrays`;
}

function buildGeneralPrompt(taskContext, userPrompt) {
  return `You are a helpful task management AI assistant. Respond with ONLY a valid JSON object.

CONTEXT:
${taskContext}

USER REQUEST: ${userPrompt}

Provide a helpful response to the user's question. Return this exact JSON structure:

{
  "summary": "Your helpful response to the user's question",
  "advice": "Additional recommendations if relevant",
  "suggestedTasks": [],
  "highlights": [],
  "warnings": [],
  "responseType": "general"
}

REQUIREMENTS:
- summary: Direct, helpful answer to the user's question
- advice: Additional guidance if applicable
- All arrays must be empty []
- Be conversational but informative
- Focus on being helpful and accurate`;
}


module.exports = router;