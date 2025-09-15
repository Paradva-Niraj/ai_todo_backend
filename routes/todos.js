const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Todo = require("../models/todos");

// ========================
// Middleware: JWT Auth
// ========================
const auth = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ success: false, error: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
};

// ========================
// CREATE Todo
// ========================
router.post("/", auth, async (req, res) => {
  try {
    if (!req.body.title) {
      return res.status(400).json({ success: false, error: "Title is required" });
    }

    const todo = new Todo({
      ...req.body,
      user: req.user.id
    });

    await todo.save();
    res.status(201).json({ success: true, data: todo });
  } catch (err) {
    console.error("❌ Create todo error:", err);
    res.status(500).json({ success: false, error: "Server error while creating todo" });
  }
});

// ========================
// READ all todos (optionally by date)
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

    const todos = await Todo.find(query).sort({ date: 1, priority: -1 });
    res.json({ success: true, count: todos.length, data: todos });
  } catch (err) {
    console.error("❌ Get todos error:", err);
    res.status(500).json({ success: false, error: "Server error while fetching todos" });
  }
});

// ========================
// READ single todo
// ========================
router.get("/:id", auth, async (req, res) => {
  try {
    const todo = await Todo.findOne({ _id: req.params.id, user: req.user.id });
    if (!todo) {
      return res.status(404).json({ success: false, error: "Todo not found" });
    }
    res.json({ success: true, data: todo });
  } catch (err) {
    console.error("❌ Get todo error:", err);
    res.status(500).json({ success: false, error: "Server error while fetching todo" });
  }
});

// ========================
// UPDATE todo
// ========================
router.put("/:id", auth, async (req, res) => {
  try {
    const todo = await Todo.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!todo) {
      return res.status(404).json({ success: false, error: "Todo not found" });
    }

    res.json({ success: true, data: todo });
  } catch (err) {
    console.error("❌ Update todo error:", err);
    res.status(500).json({ success: false, error: "Server error while updating todo" });
  }
});

// ========================
// DELETE todo
// ========================
router.delete("/:id", auth, async (req, res) => {
  try {
    const todo = await Todo.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!todo) {
      return res.status(404).json({ success: false, error: "Todo not found" });
    }

    res.json({ success: true, message: "Todo deleted successfully" });
  } catch (err) {
    console.error("❌ Delete todo error:", err);
    res.status(500).json({ success: false, error: "Server error while deleting todo" });
  }
});

module.exports = router;
