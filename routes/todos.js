// routes/todos.js
const express = require("express");
const router = express.Router();
const Todo = require("../models/todos");
const Category = require("../models/category");
const auth = require("../middleware/authMiddleware");

// helpers
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function toDateWithTime(baseDate, hhmm) {
  if (!hhmm) return null;
  const parts = hhmm.split(":").map((n) => parseInt(n, 10));
  const hh = isNaN(parts[0]) ? 0 : parts[0];
  const mm = isNaN(parts[1]) ? 0 : parts[1];
  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hh,
    mm,
    0,
    0
  );
}

function getWeekdayName(date) {
  return DAYS[date.getDay()];
}

// Parse YYYY-MM-DD or ISO and return:
// - start: local-start-of-day (used for comparisons / range queries)
// - end: local-end-of-day
// - normalizedUtc: UTC-midnight Date for storing date-only values (so ISO shows same date)
function parseDateStr(dateStr) {
  if (!dateStr) return null;
  // Parse as Y-M-D integers
  const [year, month, day] = dateStr.split('-').map(n => parseInt(n, 10));
  if (!year || !month || !day) return null;

  // local start and end (useful for range comparisons in local timezone)
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);

  if (isNaN(start.getTime())) return null;

  // normalizedUtc is a Date at 00:00:00 UTC for this calendar date.
  // Storing this prevents the visible date from shifting when converted to/from UTC.
  const normalizedUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

  return { start, end, normalizedUtc };
}
// ------------------------
// Recurrence validation
// ------------------------
function validateRecurrence(recurrence, res) {
  if (!recurrence) return null;

  if (recurrence.type === "weekly") {
    const allowed = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    if (!Array.isArray(recurrence.days)) {
      return res.status(400).json({ success: false, error: "Weekly recurrence requires days array" });
    }
    const invalid = recurrence.days.some((d) => !allowed.includes((d || "").toString().toLowerCase()));
    if (invalid) {
      return res.status(400).json({
        success: false,
        error: "Invalid weekly days (allowed: sunday..saturday)",
      });
    }
  }

  if (recurrence.type === "daily") {
    if (recurrence.time && !/^\d{1,2}:\d{2}$/.test(recurrence.time)) {
      return res.status(400).json({ success: false, error: "Invalid daily recurrence time format (HH:mm)" });
    }
  }

  return null; // valid
}

// ========================
// CREATE Todo
// ========================
router.post("/", auth, async (req, res) => {
  try {
    const {
      title,
      description,
      type,
      date,
      time,
      recurrence,
      schedule,
      startTime,
      endTime,
      categoryId,
      priority,
      tags,
    } = req.body;

    if (!title) return res.status(400).json({ success: false, error: "Title required" });

    const recurrenceError = validateRecurrence(recurrence, res);
    if (recurrenceError) return recurrenceError;

    const todoData = {
      user: req.user.id,
      title,
      description,
      type: type || "one-time",
      time,
      recurrence,
      schedule,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      category: categoryId,
      priority,
      tags,
      completions: [],
    };

    if (date) {
      const pd = parseDateStr(date);
      // store normalizedUtc (UTC midnight) so the stored ISO date matches the calendar date
      todoData.date = pd ? pd.normalizedUtc : new Date(date);
    }

    const todo = new Todo(todoData);
    await todo.save();
    const populated = await Todo.findById(todo._id).populate("category");
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    console.error("Create todo error:", err);
    res.status(500).json({ success: false, error: "Server error while creating todo" });
  }
});

// ========================
// GET today's feed
// ========================
router.get("/today", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    const weekday = getWeekdayName(today);

    const all = await Todo.find({ user: userId }).populate("category");

    const scheduleBlocks = [];
    const occurrences = [];

    all.forEach((t) => {
      if (t.type === "schedule-block" && Array.isArray(t.schedule)) {
        t.schedule.forEach((entry) => {
          if (entry.day && entry.day.toLowerCase() === weekday) {
            const start = toDateWithTime(startOfDay, entry.start);
            const end = toDateWithTime(startOfDay, entry.end);
            scheduleBlocks.push({
              taskId: t._id,
              title: t.title,
              start,
              end,
              category: t.category || null,
              rawTask: t,
            });
          }
        });
      }

      if (t.type === "recurring" && t.recurrence?.type === "daily") {
        const timeStr = (t.recurrence && t.recurrence.time) || t.time;
        occurrences.push({
          taskId: t._id,
          title: t.title,
          occurrenceTime: timeStr ? toDateWithTime(startOfDay, timeStr) : null,
          taskType: t.type,
          category: t.category || null,
          rawTask: t,
          blocked: false,
        });
      }

      if (t.type === "recurring" && t.recurrence?.type === "weekly") {
        const days = (t.recurrence.days || []).map((d) => (d ? d.toLowerCase() : ""));
        if (days.includes(weekday)) {
          const timeStr = (t.recurrence && t.recurrence.time) || t.time;
          occurrences.push({
            taskId: t._id,
            title: t.title,
            occurrenceTime: timeStr ? toDateWithTime(startOfDay, timeStr) : null,
            taskType: t.type,
            category: t.category || null,
            rawTask: t,
            blocked: false,
          });
        }
      }

      if (t.type === "reminder") {
        if (t.time) {
          occurrences.push({
            taskId: t._id,
            title: t.title,
            occurrenceTime: toDateWithTime(startOfDay, t.time),
            taskType: t.type,
            category: t.category || null,
            rawTask: t,
            blocked: false,
          });
        } else if (t.date && t.date >= startOfDay && t.date <= endOfDay) {
          occurrences.push({
            taskId: t._id,
            title: t.title,
            occurrenceTime: t.startTime || t.date,
            taskType: t.type,
            category: t.category || null,
            rawTask: t,
            blocked: false,
          });
        } else if (!t.date && !t.time) {
          occurrences.push({
            taskId: t._id,
            title: t.title,
            occurrenceTime: null,
            taskType: t.type,
            category: t.category || null,
            rawTask: t,
            blocked: false,
          });
        }
      }

      if (t.type === "one-time" && t.date) {
        const d = new Date(t.date);
        if (d >= startOfDay && d <= endOfDay) {
          const occ = t.startTime ? new Date(t.startTime) : d;
          occurrences.push({
            taskId: t._id,
            title: t.title,
            occurrenceTime: occ,
            taskType: t.type,
            category: t.category || null,
            rawTask: t,
            blocked: false,
          });
        }
      }

      if (!t.date && !t.time && t.type === "one-time") {
        occurrences.push({
          taskId: t._id,
          title: t.title,
          occurrenceTime: null,
          taskType: t.type,
          category: t.category || null,
          rawTask: t,
          blocked: false,
        });
      }
    });

    occurrences.forEach((occ) => {
      if (!occ.occurrenceTime) return;
      for (const b of scheduleBlocks) {
        if (b.start <= occ.occurrenceTime && occ.occurrenceTime <= b.end) {
          occ.blocked = true;
          occ.blockedBy = { taskId: b.taskId, title: b.title, start: b.start, end: b.end };
          break;
        }
      }
    });

    occurrences.sort((a, b) => {
      if (!a.occurrenceTime && !b.occurrenceTime) return 0;
      if (!a.occurrenceTime) return 1;
      if (!b.occurrenceTime) return -1;
      return a.occurrenceTime - b.occurrenceTime;
    });
    scheduleBlocks.sort((a, b) => a.start - b.start);

    res.json({
      success: true,
      date: startOfDay.toISOString().slice(0, 10),
      scheduleBlocks,
      occurrences,
    });
  } catch (err) {
    console.error("Get today's todos error:", err);
    res.status(500).json({ success: false, error: "Server error while fetching today's todos" });
  }
});

// ========================
// GET todos in a date range
// ========================
router.get("/range", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { start: startStr, end: endStr } = req.query;
    const startObj = parseDateStr(startStr);
    const endObj = parseDateStr(endStr);
    if (!startObj || !endObj) return res.status(400).json({ success: false, error: "Invalid start/end date" });

    const todos = await Todo.find({ user: userId }).populate("category");

    const results = [];

    for (const t of todos) {
      if (t.type === "one-time") {
        if (t.date) {
          const d = new Date(t.date);
          if (d >= startObj.start && d <= endObj.end) results.push(t);
        } else {
          results.push(t);
        }
      } else if (t.type === "reminder") {
        if (t.date) {
          const d = new Date(t.date);
          if (d >= startObj.start && d <= endObj.end) results.push(t);
        } else {
          results.push(t);
        }
      } else if (t.type === "recurring") {
        results.push(t);
      } else if (t.type === "schedule-block") {
        results.push(t);
      } else {
        results.push(t);
      }
    }

    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    console.error("Range fetch error:", err);
    res.status(500).json({ success: false, error: "Server error while fetching range" });
  }
});

router.patch("/:id/complete", auth, async (req, res) => {
  try {
    const todo = await Todo.findOne({ _id: req.params.id, user: req.user.id });
    if (!todo) return res.status(404).json({ success: false, error: "Todo not found" });

    const dateStr = req.query.date;
    if (dateStr) {
      // Validate format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid date format. Use YYYY-MM-DD" 
        });
      }

      // Parse as UTC by appending 'T00:00:00.000Z'
      // This prevents timezone conversion
      const normalized = new Date(`${dateStr}T00:00:00.000Z`);

      if (isNaN(normalized.getTime())) {
        return res.status(400).json({ success: false, error: "Invalid date" });
      }

      // Check if already completed for this date
      const already = (todo.completions || []).some((c) => {
        const cd = new Date(c.date);
        const cdStr = cd.toISOString().split('T')[0];
        return cdStr === dateStr;
      });

      if (already) {
        return res.status(409).json({ 
          success: false, 
          error: "Already completed for this date"
        });
      }

      todo.completions = todo.completions || [];
      todo.completions.push({ date: normalized });
      await todo.save();

      console.log(`Todo ${todo._id} marked complete for date: ${dateStr} (stored as ${normalized.toISOString()})`);

      return res.json({ 
        success: true, 
        data: todo, 
        completedFor: dateStr
      });
    } else {
      // Global completion
      if (todo.completed) {
        return res.status(409).json({ success: false, error: "Todo already completed" });
      }
      todo.completed = true;
      todo.status = "completed";
      await todo.save();
      return res.json({ success: true, data: todo });
    }
  } catch (err) {
    console.error("Complete todo error:", err);
    return res.status(500).json({ 
      success: false, 
      error: "Server error while marking complete" 
    });
  }
});

// ========================
// Uncomplete (remove per-date completion)
// PATCH /api/todos/:id/uncomplete?date=YYYY-MM-DD
router.patch("/:id/uncomplete", auth, async (req, res) => {
  try {
    const todo = await Todo.findOne({ _id: req.params.id, user: req.user.id });
    if (!todo) return res.status(404).json({ success: false, error: "Todo not found" });

    const dateStr = req.query.date;
    if (!dateStr) {
      return res.status(400).json({ success: false, error: "Date parameter required" });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid date format" 
      });
    }

    const initialLength = (todo.completions || []).length;
    
    // Filter by comparing ISO date strings
    todo.completions = (todo.completions || []).filter((c) => {
      const cd = new Date(c.date);
      const cdStr = cd.toISOString().split('T')[0];
      return cdStr !== dateStr;
    });

    if (todo.completions.length === initialLength) {
      return res.status(404).json({ 
        success: false, 
        error: "No completion found for this date" 
      });
    }

    await todo.save();

    console.log(`Todo ${todo._id} uncompleted for date: ${dateStr}`);

    return res.json({ 
      success: true, 
      data: todo, 
      message: "Completion removed" 
    });
  } catch (err) {
    console.error("Uncomplete todo error:", err);
    return res.status(500).json({ 
      success: false, 
      error: "Server error while uncompleting todo" 
    });
  }
});

// ========================
// READ all todos
// ========================
router.get("/", auth, async (req, res) => {
  try {
    const query = { user: req.user.id };

    if (req.query.date) {
      const parsed = parseDateStr(req.query.date);
      if (!parsed) return res.status(400).json({ success: false, error: "Invalid date" });
      // use local start/end for query comparisons
      query.date = { $gte: parsed.start, $lt: parsed.end };
    }

    const todos = await Todo.find(query).populate("category").sort({ priority: -1, createdAt: -1 });
    res.json({ success: true, count: todos.length, data: todos });
  } catch (err) {
    console.error("Get todos error:", err);
    res.status(500).json({ success: false, error: "Server error while fetching todos" });
  }
});

// ========================
// READ single todo
// ========================
router.get("/:id", auth, async (req, res) => {
  try {
    const todo = await Todo.findOne({ _id: req.params.id, user: req.user.id }).populate("category");
    if (!todo) return res.status(404).json({ success: false, error: "Todo not found" });
    res.json({ success: true, data: todo });
  } catch (err) {
    console.error("Get todo error:", err);
    res.status(500).json({ success: false, error: "Server error while fetching todo" });
  }
});

// ========================
// UPDATE todo
// ========================
router.put("/:id", auth, async (req, res) => {
  try {
    const updateData = req.body;

    const existing = await Todo.findOne({ _id: req.params.id, user: req.user.id });
    if (!existing) return res.status(404).json({ success: false, error: "Todo not found" });
    if (existing.completed) return res.status(403).json({ success: false, error: "Completed todos cannot be edited" });

    const now = new Date();
    if (existing.date) {
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      if (existing.date < startOfToday) {
        return res.status(403).json({ success: false, error: "Past todos cannot be edited" });
      }
    }

    const recurrenceError = validateRecurrence(updateData.recurrence, res);
    if (recurrenceError) return recurrenceError;

    if (updateData.date && typeof updateData.date === "string") {
      const pd = parseDateStr(updateData.date);
      if (pd) {
        // save UTC-normalized date to avoid cross-timezone shifts
        updateData.date = pd.normalizedUtc;
      } else {
        // attempt parse fallback
        updateData.date = new Date(updateData.date);
      }
    }

    const todo = await Todo.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, updateData, {
      new: true,
      runValidators: true,
    }).populate("category");
    if (!todo) return res.status(404).json({ success: false, error: "Todo not found" });
    res.json({ success: true, data: todo });
  } catch (err) {
    console.error("Update todo error:", err);
    res.status(500).json({ success: false, error: "Server error while updating todo" });
  }
});

// ========================
// DELETE todo
// ========================
router.delete("/:id", auth, async (req, res) => {
  try {
    const existing = await Todo.findOne({ _id: req.params.id, user: req.user.id });
    if (!existing) return res.status(404).json({ success: false, error: "Todo not found" });
    if (existing.completed) return res.status(403).json({ success: false, error: "Completed todos cannot be deleted" });

    const now = new Date();
    if (existing.date) {
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      if (existing.date < startOfToday) {
        return res.status(403).json({ success: false, error: "Past todos cannot be deleted" });
      }
    }

    const todo = await Todo.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!todo) return res.status(404).json({ success: false, error: "Todo not found" });
    res.json({ success: true, message: "Todo deleted successfully" });
  } catch (err) {
    console.error("Delete todo error:", err);
    res.status(500).json({ success: false, error: "Server error while deleting todo" });
  }
});

module.exports = router;