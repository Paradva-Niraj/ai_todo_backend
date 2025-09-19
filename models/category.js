// models/category.js
const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    icon: { type: String }, // emoji or icon name
    color: { type: String }, // hex
  },
  { timestamps: true }
);

module.exports = mongoose.model("Category", categorySchema);
