const mongoose = require('mongoose');

/**
 * KnowledgeDocument Schema for RAG (Retrieval-Augmented Generation).
 * Stores chunked knowledge articles, platform FAQs, and policy documents
 * alongside embedding vectors for semantic search.
 */
const knowledgeDocumentSchema = new mongoose.Schema(
  {
    docId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['student', 'tpo', 'recruiter', 'superadmin', 'common'],
      default: 'common',
      index: true,
    },
    category: {
      type: String,
      default: 'General',
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
    embedding: {
      type: [Number],
      default: [],
    },
    chunkIndex: {
      type: Number,
      default: 0,
    },
    keywords: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

knowledgeDocumentSchema.index({ role: 1, category: 1 });

module.exports = mongoose.model('KnowledgeDocument', knowledgeDocumentSchema);
