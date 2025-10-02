// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

const authRouter = require("./auth/auth");
const todosRouter = require("./routes/todos");
const categoriesRouter = require("./routes/categories");
const aiRouter = require('./routes/ai');

const app = express();

// middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// connect database
const mongoUri = process.env.MONGODB_URI;
mongoose
  .connect(mongoUri)
  .then(() => console.log("Connected to database"))
  .catch((err) => {
    console.error("Error connecting database:", err);
    process.exit(1); // stop server if DB connection fails
  });

// health check
app.get("/", (req, res) => res.send("server running"));

// routes
app.use("/api/auth", authRouter);
app.use("/api/todos", todosRouter);
app.use("/api/categories", categoriesRouter);
app.use('/api/ai', aiRouter);

// start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`running on port ${PORT}`);
});
