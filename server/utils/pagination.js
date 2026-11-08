/**
 * Shared pagination helper for Express controllers
 */
const getPagination = (query = {}, defaultLimit = 20, maxLimit = 100) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const formatPaginatedResponse = ({ data, total, page, limit, legacyKey, extra = {} }) => {
  const totalPages = Math.ceil(total / limit) || 1;
  const response = {
    success: true,
    data,
    page,
    limit,
    total,
    totalPages,
    count: Array.isArray(data) ? data.length : 0,
    ...extra,
  };

  if (legacyKey && !response[legacyKey]) {
    response[legacyKey] = data;
  }

  return response;
};

module.exports = {
  getPagination,
  formatPaginatedResponse,
};

