// routes/categories.js
const express = require("express");
const router = express.Router();
const Category = require("../models/category");
const auth = require("../middleware/authMiddleware");

// CREATE category
router.post("/", auth, async (req, res) => {
  try {
    const { name, icon, color } = req.body;
    if (!name) return res.status(400).json({ success: false, error: "Category name required" });

    const cat = new Category({ user: req.user.id, name, icon, color });
    await cat.save();
    res.status(201).json({ success: true, data: cat });
  } catch (err) {
    console.error("Create category error:", err);
    res.status(500).json({ success: false, error: "Server error creating category" });
  }
});

// GET all categories for user
router.get("/", auth, async (req, res) => {
  try {
    const cats = await Category.find({ user: req.user.id }).sort({ name: 1 });
    res.json({ success: true, count: cats.length, data: cats });
  } catch (err) {
    console.error("Get categories error:", err);
    res.status(500).json({ success: false, error: "Server error fetching categories" });
  }
});

// DELETE category (optional)
router.delete("/:id", auth, async (req, res) => {
  try {
    const cat = await Category.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!cat) return res.status(404).json({ success: false, error: "Category not found" });
    res.json({ success: true, message: "Category deleted" });
  } catch (err) {
    console.error("Delete category error:", err);
    res.status(500).json({ success: false, error: "Server error deleting category" });
  }
});

module.exports = router;
