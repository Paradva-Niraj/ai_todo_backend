const mongoose = require("mongoose");

const subTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String }, // optional details for subtask
    completed: { type: Boolean, default: false },
    estimateMin: { type: Number }, // estimated time in minutes
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
  },
  { timestamps: true }
);

const todoSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // for fast lookup of a user's todos
    },

    // main task details
    title: { type: String, required: true, trim: true },
    description: { type: String }, // full detailed description

    // scheduling
    date: {
      type: Date,
      required: true,
      index: true, // enables fast day-wise queries
    },
    startTime: { type: Date }, // optional start time
    endTime: { type: Date }, // optional end time (for durations)

    // completion & status
    completed: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["pending", "in-progress", "completed", "archived"],
      default: "pending",
    },

    // priority for sorting/filtering
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
      index: true,
    },

    // extra metadata
    tags: [{ type: String, trim: true }], // e.g. ["study","exam"]
    category: { type: String }, // e.g. "Personal", "Work", "School"

    // subtasks (embedded documents)
    subTasks: [subTaskSchema],

    // notifications
    reminderAt: { type: Date }, // when to notify
    notificationId: { type: Number }, // for cancel/reschedule

    // stats
    estimatedMinutes: { type: Number }, // whole task estimate
    actualMinutes: { type: Number }, // time spent tracking

    // audit trail
    createdByAI: { type: Boolean, default: false }, // AI-suggested tasks
  },
  { timestamps: true }
);

// compound index for optimized queries (user + date)
todoSchema.index({ user: 1, date: 1 });

module.exports = mongoose.model("Todo", todoSchema);