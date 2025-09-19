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

const app = express();

// middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// connect database
const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/ai_todo_backend";
mongoose
  .connect(mongoUri)
  .then(() => console.log("Connected to database"))
  .catch((err) => console.error("Error on connecting database:", err));

app.get("/", (req, res) => res.send("server running"));

// routes
app.use("/api/auth", authRouter);
app.use("/api/todos", todosRouter);
app.use("/api/categories", categoriesRouter);

// port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`running in port ${PORT}`);
});
