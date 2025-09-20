// src/services/reviewsService.ts
import api from "../config/api";

/* ============================== Types ============================== */

export interface ReviewInput {
  productId: string;
  rating: number; // 1..5
  title?: string;
  comment: string;
  userName?: string;
  userEmail?: string;
}

export type ReviewDoc = {
  _id: string;
  productId: string;
  rating: number;
  title?: string;
  comment: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  verified?: boolean;
  status?: "pending" | "approved" | "rejected";
  helpful?: number;
  createdAt?: string;
  updatedAt?: string;
};

type Pagination = { page: number; limit: number; total: number; pages: number };

export type ReviewSummary = { averageRating: number; reviewCount: number };

export type BulkSummaryMap = Record<string, ReviewSummary>;

/* ============================== Utils ============================== */

function normPagination(p: any, fallback: Pagination): Pagination {
  return {
    page: Number(p?.page ?? p?.currentPage ?? fallback.page),
    limit: Number(p?.limit ?? fallback.limit),
    total: Number(p?.total ?? p?.totalProducts ?? fallback.total),
    pages: Number(p?.pages ?? p?.totalPages ?? fallback.pages),
  };
}

/** Broadcast a “reviews changed” signal so other tabs/components can refresh */
function notifyReviewsChanged(productId: string) {
  try {
    // same-tab
    window.dispatchEvent(new CustomEvent("reviews:changed", { detail: { productId } }));
    // cross-tab
    localStorage.setItem(`reviews:changed:${productId}`, String(Date.now()));
  } catch {
    /* no-op */
  }
}

/* ============================== Client cache ============================== */

/** 30s default TTL (server also caches for ~60s; we keep it shorter client-side) */
const DEFAULT_TTL = 30_000;

type CacheEntry<T> = { value: T; expires: number };
const summaryCache = new Map<string, CacheEntry<ReviewSummary>>();
const inflightSummary = new Map<string, Promise<ReviewSummary>>();
let storageListenerBound = false;

function readCache<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache<T>(map: Map<string, CacheEntry<T>>, key: string, value: T, ttl = DEFAULT_TTL) {
  map.set(key, { value, expires: Date.now() + ttl });
}

function bindStorageInvalidator() {
  if (storageListenerBound || typeof window === "undefined") return;
  storageListenerBound = true;

  window.addEventListener("storage", (e) => {
    if (!e.key) return;
    if (e.key.startsWith("reviews:changed:")) {
      const productId = e.key.split(":").pop()!;
      summaryCache.delete(productId);
    }
  });

  // same-tab invalidation
  window.addEventListener("reviews:changed" as any, (e: any) => {
    const productId = e?.detail?.productId;
    if (productId) summaryCache.delete(productId);
  });
}
bindStorageInvalidator();

/* ============================== Service ============================== */

export const reviewsService = {
  /** GET /api/products/:productId/reviews */
  async list(
    productId: string,
    page = 1,
    limit = 10,
    sort: "new" | "old" | "top" = "new"
  ): Promise<{ reviews: ReviewDoc[]; pagination: Pagination }> {
    const { data } = await api.get(`/products/${productId}/reviews`, {
      params: { page, limit, sort, _ts: Date.now() }, // cache-bust lists only
    });

    if (!data?.success) throw new Error(data?.message || "Failed to fetch reviews");

    const fallback: Pagination = { page, limit, total: 0, pages: 1 };
    return {
      reviews: Array.isArray(data.data) ? (data.data as ReviewDoc[]) : [],
      pagination: normPagination(data.pagination, fallback),
    };
  },

  /** POST /api/products/:productId/reviews */
  async create(payload: ReviewInput): Promise<ReviewDoc> {
    const { productId, ...body } = payload;
    try {
      const { data } = await api.post(`/products/${productId}/reviews`, body);
      if (!data?.success) throw new Error(data?.message || "Failed to submit review");

      // Invalidate/broadcast for summaries, cards, etc.
      summaryCache.delete(productId);
      notifyReviewsChanged(productId);

      return data.data as ReviewDoc;
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message;
      if (status === 400) throw new Error(msg || "Invalid review data.");
      if (status === 403) throw new Error(msg || "Only verified purchasers can review this product.");
      if (status === 404) throw new Error(msg || "Product not found.");
      if (status === 409) throw new Error(msg || "You already reviewed this product.");
      throw new Error(msg || "Server error while submitting review.");
    }
  },

  /** POST /api/reviews/:id/helpful */
  async markHelpful(reviewId: string): Promise<void> {
    await api.post(`/reviews/${reviewId}/helpful`);
  },

  /**
   * GET /api/reviews/summary?productId=...
   * Uses a small client cache + in-flight de-dup.
   * Set forceRefresh to bypass cache after any explicit update.
   */
  async summary(
    productId: string,
    opts?: { forceRefresh?: boolean; ttlMs?: number }
  ): Promise<ReviewSummary> {
    const force = !!opts?.forceRefresh;
    const ttl = opts?.ttlMs ?? DEFAULT_TTL;

    if (!force) {
      const cached = readCache(summaryCache, productId);
      if (cached) return cached;
      const pending = inflightSummary.get(productId);
      if (pending) return pending;
    }

    const p = (async () => {
      const { data } = await api.get(`/reviews/summary`, { params: { productId } });
      const payload = data?.data || data || {};
      const out: ReviewSummary = {
        averageRating: Number(payload?.averageRating ?? 0),
        reviewCount: Number(payload?.reviewCount ?? 0),
      };
      writeCache(summaryCache, productId, out, ttl);
      return out;
    })();

    inflightSummary.set(productId, p);
    try {
      return await p;
    } finally {
      inflightSummary.delete(productId);
    }
  },

  /**
   * POST /api/reviews/bulk-summary
   * Ask server for many products at once (use this on listings/grids).
   * Returns a map: { [productId]: { averageRating, reviewCount } }
   */
  async bulkSummary(
    productIds: string[],
    opts?: { forceRefresh?: boolean; ttlMs?: number }
  ): Promise<BulkSummaryMap> {
    const force = !!opts?.forceRefresh;
    const ttl = opts?.ttlMs ?? DEFAULT_TTL;

    const result: BulkSummaryMap = {};
    const missing: string[] = [];

    for (const id of productIds) {
      if (!force) {
        const cached = readCache(summaryCache, id);
        if (cached) {
          result[id] = cached;
          continue;
        }
      }
      missing.push(id);
    }

    if (missing.length) {
      const { data } = await api.post(`/reviews/bulk-summary`, { productIds: missing });
      const map = (data?.data || {}) as Record<string, { avg?: number; total?: number; averageRating?: number; reviewCount?: number }>;

      for (const id of missing) {
        const m = map[id] || {};
        const summary: ReviewSummary = {
          averageRating: Number(m.averageRating ?? m.avg ?? 0),
          reviewCount: Number(m.reviewCount ?? m.total ?? 0),
        };
        writeCache(summaryCache, id, summary, ttl);
        result[id] = summary;
      }
    }

    // Ensure every id exists in the map (fallback zeros if server had none)
    for (const id of productIds) {
      if (!result[id]) {
        const zero: ReviewSummary = { averageRating: 0, reviewCount: 0 };
        writeCache(summaryCache, id, zero, ttl);
        result[id] = zero;
      }
    }

    return result;
  },
};

export default reviewsService;
