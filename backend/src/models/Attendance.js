const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    date: { type: Date, required: true },
    status: {
      type: String,
      enum: ["present", "absent", "half_day", "leave", "holiday"],
      required: true,
    },
    shift: { type: String }, // e.g. "Day", "Night"
    checkIn: { type: Date },
    checkOut: { type: Date },
    overtimeHours: { type: Number, default: 0 },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
