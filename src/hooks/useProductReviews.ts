// src/hooks/useProductReviews.ts
import { useCallback, useEffect, useRef, useState } from "react";
import api from "../config/api";

/* ---------- Types ---------- */
export interface ProductReview {
  _id: string;
  productId: string;
  user?: { _id?: string; name?: string; avatar?: string };
  rating: number;            // 1..5
  title?: string;
  comment?: string;
  images?: string[];
  createdAt: string;
  updatedAt?: string;
  helpfulCount?: number;
}

type SortKey = "recent" | "helpful" | "rating_desc" | "rating_asc";

export interface UseProductReviewsOptions {
  pageSize?: number;        // default 10
  sort?: SortKey;           // default "recent"
}

type ListResponse = {
  success?: boolean;
  items?: ProductReview[];
  data?: ProductReview[];   // some backends use data
  total?: number;
  page?: number;
  limit?: number;
};

/* ---------- Hook ---------- */
export function useProductReviews(
  productId: string | undefined,
  opts: UseProductReviewsOptions = {}
) {
  const pageSize = opts.pageSize ?? 10;
  const sort = opts.sort ?? "recent";

  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | undefined>(undefined);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const hasMore = total == null ? false : reviews.length < total;

  const fetchPage = useCallback(
    async (pageToGet: number, mode: "replace" | "append") => {
      if (!productId) return;

      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;

      mode === "replace" ? setRefreshing(true) : setLoading(true);
      setError(null);

      try {
        const { data } = await api.get<ListResponse>(
          `/products/${encodeURIComponent(productId)}/reviews`,
          {
            params: { page: pageToGet, limit: pageSize, sort },
            signal: ctl.signal as any, // axios supports AbortController
          }
        );

        const list = data.items ?? data.data ?? [];
        const next = mode === "replace" ? list : [...reviews, ...list];

        setReviews(next);
        setPage(pageToGet);
        if (typeof data.total === "number") setTotal(data.total);
      } catch (e: any) {
        if (e?.name !== "CanceledError" && e?.code !== "ERR_CANCELED") {
          setError(e?.response?.data?.message || e?.message || "Failed to load reviews");
        }
      } finally {
        mode === "replace" ? setRefreshing(false) : setLoading(false);
      }
    },
    [productId, pageSize, sort, reviews]
  );

  const refresh = useCallback(() => fetchPage(1, "replace"), [fetchPage]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchPage(page + 1, "append");
    }
  }, [fetchPage, hasMore, loading, page]);

  // initial + on deps change
  useEffect(() => {
    setReviews([]);
    setTotal(undefined);
    setPage(1);
    if (productId) refresh();
    return () => abortRef.current?.abort();
  }, [productId, pageSize, sort, refresh]);

  /* ---------- Optional: add review (optimistic) ----------
     Adjust endpoint/fields if your backend differs.
     Current assumption: POST /products/:id/reviews accepts
     { rating, title?, comment?, images? (File[]) }
  ------------------------------------------------------- */
  const addReview = useCallback(
    async (payload: { rating: number; title?: string; comment?: string; images?: File[] }) => {
      if (!productId) throw new Error("Missing productId");

      // Prepare FormData so images work automatically.
      const form = new FormData();
      form.append("rating", String(payload.rating));
      if (payload.title) form.append("title", payload.title);
      if (payload.comment) form.append("comment", payload.comment);
      (payload.images || []).forEach((f) => form.append("images", f));

      // Optimistic placeholder
      const optimistic: ProductReview = {
        _id: `temp_${Date.now()}`,
        productId,
        rating: payload.rating,
        title: payload.title,
        comment: payload.comment,
        images: [], // server will return final URLs if you store images
        createdAt: new Date().toISOString(),
      };

      setReviews((r) => [optimistic, ...r]);
      try {
        const { data } = await api.post<{ success: boolean; review: ProductReview }>(
          `/products/${encodeURIComponent(productId)}/reviews`,
          form
        );
        const saved = data.review;
        setReviews((r) =>
          r.map((it) => (it._id === optimistic._id ? saved : it))
        );
        // If server updates totals/order, refreshing ensures consistency:
        await refresh();
        return saved;
      } catch (e: any) {
        // rollback optimistic
        setReviews((r) => r.filter((it) => it._id !== optimistic._id));
        throw e;
      }
    },
    [productId, refresh]
  );

  return {
    reviews,
    setReviews,   // exposed for local tweaks
    loading,
    refreshing,
    error,
    page,
    pageSize,
    total,
    hasMore,
    refresh,
    loadMore,
    addReview,    // optional creator
  };
}
