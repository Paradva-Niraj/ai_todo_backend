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
  const [hh, mm] = hhmm.split(":").map((n) => parseInt(n, 10));
  const d = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hh || 0,
    mm || 0,
    0,
    0
  );
  return d;
}

function getWeekdayName(date) {
  return DAYS[date.getDay()];
}

function parseDateStr(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { start, end };
}

// ------------------------
// Recurrence validation
// ------------------------
function validateRecurrence(recurrence, res) {
  if (!recurrence) return null;

  if (recurrence.type === "weekly") {
    const allowed = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    if (!Array.isArray(recurrence.days)) {
      return res.status(400).json({ success: false, error: "Weekly recurrence requires days array" });
    }
    const invalid = recurrence.days.some((d) => !allowed.includes(d.toLowerCase()));
    if (invalid) {
      return res.status(400).json({
        success: false,
        error: "Invalid weekly days (allowed: monday..saturday)",
      });
    }
  }

  if (recurrence.type === "daily") {
    if (recurrence.time && !/^\d{2}:\d{2}$/.test(recurrence.time)) {
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
      time, // "HH:mm"
      recurrence,
      schedule,
      startTime,
      endTime,
      categoryId,
      priority,
      tags,
    } = req.body;

    if (!title) return res.status(400).json({ success: false, error: "Title required" });

    // validate recurrence if present
    const recurrenceError = validateRecurrence(recurrence, res);
    if (recurrenceError) return recurrenceError;

    const todo = new Todo({
      user: req.user.id,
      title,
      description,
      type: type || "one-time",
      date: date ? new Date(date) : undefined,
      time,
      recurrence,
      schedule,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      category: categoryId,
      priority,
      tags,
    });

    await todo.save();
    res.status(201).json({ success: true, data: todo });
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
      // schedule-block type
      if (t.type === "schedule-block" && Array.isArray(t.schedule)) {
        t.schedule.forEach((entry) => {
          if (entry.day.toLowerCase() === weekday) {
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

      // recurring.daily
      if (t.type === "recurring" && t.recurrence?.type === "daily") {
        const timeStr = t.recurrence.time || t.time;
        if (timeStr) {
          occurrences.push({
            taskId: t._id,
            title: t.title,
            occurrenceTime: toDateWithTime(startOfDay, timeStr),
            taskType: t.type,
            category: t.category || null,
            rawTask: t,
            blocked: false,
          });
        }
      }

      // recurring.weekly
      if (t.type === "recurring" && t.recurrence?.type === "weekly") {
        const days = (t.recurrence.days || []).map((d) => d.toLowerCase());
        if (days.includes(weekday)) {
          const timeStr = t.recurrence.time || t.time;
          occurrences.push({
            taskId: t._id,
            title: t.title,
            occurrenceTime: toDateWithTime(startOfDay, timeStr),
            taskType: t.type,
            category: t.category || null,
            rawTask: t,
            blocked: false,
          });
        }
      }

      // reminder
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
        }
      }

      // one-time today
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

      // floating one-time todos
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

    // mark blocked
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

    // sort
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

// ========================
// Mark todo complete
// ========================
router.patch("/:id/complete", auth, async (req, res) => {
  try {
    const todo = await Todo.findOne({ _id: req.params.id, user: req.user.id });
    if (!todo) return res.status(404).json({ success: false, error: "Todo not found" });

    const dateStr = req.query.date;
    if (dateStr) {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return res.status(400).json({ success: false, error: "Invalid date" });

      const normalized = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

      const already = (todo.completions || []).some((c) => {
        const cd = new Date(c.date);
        return cd.getFullYear() === normalized.getFullYear() &&
               cd.getMonth() === normalized.getMonth() &&
               cd.getDate() === normalized.getDate();
      });
      if (already) return res.status(409).json({ success: false, error: "Already completed for this date" });

      todo.completions = todo.completions || [];
      todo.completions.push({ date: normalized });
      await todo.save();
      return res.json({ success: true, data: todo, completedFor: dateStr });
    } else {
      if (todo.completed) return res.status(409).json({ success: false, error: "Todo already completed" });
      todo.completed = true;
      todo.status = "completed";
      await todo.save();
      return res.json({ success: true, data: todo });
    }
  } catch (err) {
    console.error("Complete todo error:", err);
    res.status(500).json({ success: false, error: "Server error while marking complete" });
  }
});

// ========================
// READ all todos
// ========================
router.get("/", auth, async (req, res) => {
  try {
    const query = { user: req.user.id };

    if (req.query.date) {
      const start = new Date(req.query.date);
      const end = new Date(req.query.date);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lt: end };
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

    // validate recurrence if present
    const recurrenceError = validateRecurrence(updateData.recurrence, res);
    if (recurrenceError) return recurrenceError;

    const todo = await Todo.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, updateData, {
      new: true,
      runValidators: true,
    });
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

// Check if a todo is completed (global or for a specific date)
// GET /api/todos/:id/completed?date=YYYY-MM-DD
router.get("/:id/completed", auth, async (req, res) => {
  try {
    const todo = await Todo.findOne({ _id: req.params.id, user: req.user.id });
    if (!todo) return res.status(404).json({ success: false, error: "Todo not found" });

    const dateStr = req.query.date;
    let completedForDate = false;
    if (dateStr) {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return res.status(400).json({ success: false, error: "Invalid date" });
      const normalized = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const comps = todo.completions || [];
      completedForDate = comps.some((c) => {
        const cd = new Date(c.date);
        return cd.getFullYear() === normalized.getFullYear() &&
               cd.getMonth() === normalized.getMonth() &&
               cd.getDate() === normalized.getDate();
      });
    }

    return res.json({
      success: true,
      global: !!todo.completed,
      date: dateStr || null,
      completed: dateStr ? completedForDate : !!todo.completed,
    });
  } catch (err) {
    console.error("Check completed error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;
