const mongoose = require('mongoose');

const placementSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student reference is required'],
    },
    drive: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Drive',
      required: [true, 'Drive reference is required'],
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company reference is required'],
    },
    packageLpa: {
      type: Number,
      min: [0, 'Package (LPA) cannot be negative'],
      default: null,
    },
    offerDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Optional compound index: prevents duplicate placement records for the same student in the same drive
placementSchema.index({ student: 1, drive: 1 }, { unique: true });
placementSchema.index({ company: 1, packageLpa: -1 });
placementSchema.index({ student: 1 });

const Placement = mongoose.model('Placement', placementSchema);

module.exports = Placement;

