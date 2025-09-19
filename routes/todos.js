// routes/todos.js
const express = require("express");
const router = express.Router();
const Todo = require("../models/todos");
const Category = require("../models/category");
const auth = require("../middleware/authMiddleware");

// helpers
const DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

function toDateWithTime(baseDate, hhmm) {
  if (!hhmm) return null;
  const [hh, mm] = hhmm.split(":").map((n) => parseInt(n, 10));
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hh || 0, mm || 0, 0, 0);
  return d;
}

function getWeekdayName(date) {
  return DAYS[date.getDay()];
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
// Returns:
// {
//   success: true,
//   date: "2025-09-19",
//   scheduleBlocks: [ { taskId, title, start, end, category, rawTask } ],
//   occurrences: [ { taskId, title, occurrenceTime, blocked, taskType, category, rawTask } ]
// }
router.get("/today", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date(); // use server local timezone (if you need a specific TZ, convert here)
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    const weekday = getWeekdayName(today);

    // fetch all user's todos (we'll filter in JS)
    const all = await Todo.find({ user: userId }).populate("category");

    const scheduleBlocks = [];
    const occurrences = [];

    // build schedule blocks and occurrences
    all.forEach((t) => {
      // schedule-block type -> create block entries for today's matching schedule entries
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

      // recurring / reminder / one-time occurrences
      // 1) recurring.daily
      if (t.type === "recurring" && t.recurrence && t.recurrence.type === "daily") {
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

      // 2) recurring.weekly
      if (t.type === "recurring" && t.recurrence && t.recurrence.type === "weekly") {
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

      // 3) reminder (time every day or explicit date+time)
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
          // fallback if date is present
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

      // 4) one-time with date equals today
      if (t.type === "one-time" && t.date) {
        const d = new Date(t.date);
        if (d >= startOfDay && d <= endOfDay) {
          // prefer startTime if present, else use date (date may include time)
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

      // 5) fallback: floating todos (no time/date) - show as end-of-day with null time
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

    // mark occurrences that fall inside any scheduleBlock as blocked
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

    // Sort: timed occurrences ascending (earlier first), then floating (null time) at the end.
    occurrences.sort((a, b) => {
      if (!a.occurrenceTime && !b.occurrenceTime) return 0;
      if (!a.occurrenceTime) return 1;
      if (!b.occurrenceTime) return -1;
      return a.occurrenceTime - b.occurrenceTime;
    });

    // also sort schedule blocks by start
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
// READ all todos (optional filter by date)
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
    const todo = await Todo.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!todo) return res.status(404).json({ success: false, error: "Todo not found" });
    res.json({ success: true, message: "Todo deleted successfully" });
  } catch (err) {
    console.error("Delete todo error:", err);
    res.status(500).json({ success: false, error: "Server error while deleting todo" });
  }
});

module.exports = router;
