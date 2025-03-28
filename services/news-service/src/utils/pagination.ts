import { Request } from 'express';

interface PaginationOptions {
  page: number;
  limit: number;
  offset: number;
}

export const getPaginationOptions = (req: Request): PaginationOptions => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = (page - 1) * limit;

  return {
    page,
    limit,
    offset,
  };
};

export const getPaginationData = (count: number, page: number, limit: number) => {
  return {
    total: count,
    currentPage: page,
    totalPages: Math.ceil(count / limit),
    perPage: limit,
  };
};

export default {
  getPaginationOptions,
  getPaginationData,
};