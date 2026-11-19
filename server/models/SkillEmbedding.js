const mongoose = require('mongoose');

const skillEmbeddingSchema = new mongoose.Schema(
  {
    skill: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    embedding: {
      type: [Number],
      required: true,
    },
    dimensions: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const SkillEmbedding = mongoose.model('SkillEmbedding', skillEmbeddingSchema);

module.exports = SkillEmbedding;
