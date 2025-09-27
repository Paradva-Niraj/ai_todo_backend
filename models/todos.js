// models/todos.js
const mongoose = require("mongoose");

const DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

const subTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    completed: { type: Boolean, default: false },
    estimateMin: { type: Number },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
  },
  { timestamps: true }
);

const scheduleEntrySchema = new mongoose.Schema(
  {
    day: { type: String, enum: DAYS, required: true }, // monday, tuesday, ...
    start: { type: String, required: true }, // "08:00"
    end: { type: String, required: true }, // "14:00"
  },
  { _id: false }
);

const recurrenceSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["none", "daily", "weekly", "custom"], default: "none" },
    time: { type: String }, // "20:00" for daily/weekly reminders
    days: [{ type: String, enum: DAYS }], // for weekly recurrence
    // custom fields possible later (interval etc.)
  },
  { _id: false }
);

const todoSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },

    title: { type: String, required: true, trim: true },
    description: { type: String },

    // type of task:
    // - one-time: date field used
    // - reminder: single daily reminder or reminder on a date/time
    // - recurring: uses recurrence
    // - schedule-block: block periods (like school) using schedule[]
    type: {
      type: String,
      enum: ["one-time", "reminder", "recurring", "schedule-block"],
      default: "one-time",
    },

    // for one-time tasks (non-recurring)
    date: { type: Date },

    // optional time for a single occurrence (HH:mm stored in `time`)
    time: { type: String },

    // recurrence object
    recurrence: recurrenceSchema,

    // schedule-block (array of day/start/end objects) - for school etc.
    schedule: [scheduleEntrySchema], // only for schedule-block type

    // optional explicit start/end datetime for one-time durations
    startTime: { type: Date },
    endTime: { type: Date },

    // status & meta
    completed: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["pending", "in-progress", "completed", "archived"],
      default: "pending",
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },

    tags: [{ type: String, trim: true }],
    subTasks: [subTaskSchema],

    reminderAt: { type: Date }, // an explicit date for notification if needed
    notificationId: { type: String },

    estimatedMinutes: { type: Number },
    actualMinutes: { type: Number },

    createdByAI: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// index by user (common queries)
// todoSchema.index({ user: 1 });

module.exports = mongoose.model("Todo", todoSchema);