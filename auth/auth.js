// auth/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/users");

const router = express.Router();

// Register
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: `User for ${email} is already registered` });
    }

    const hashpass = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashpass });
    await newUser.save();

    // create token
    const token = jwt.sign(
      { id: newUser._id, name: newUser.username, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log(`User registered: ${email} (${username})`);
    res.status(201).json({
      message: `User registered successfully`,
      token,
      user: { id: newUser._id, username: newUser.username, email: newUser.email },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error, try again later" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const passMatch = await bcrypt.compare(password, user.password);
    if (!passMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, name: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log(`User login: ${email}`);
    res.status(200).json({
      message: `Login successful`,
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error, try again later" });
  }
});

module.exports = router;
