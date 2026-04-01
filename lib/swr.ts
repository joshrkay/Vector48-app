"use client";

import { useEffect, useMemo, useState } from "react";

type SWRKey = readonly unknown[] | null;

type SWROptions = {
  dedupingInterval?: number;
  revalidateOnFocus?: boolean;
  revalidateIfStale?: boolean;
  keepPreviousData?: boolean;
};

type SWRResponse<Data> = {
  data: Data | undefined;
  error: Error | undefined;
  isLoading: boolean;
};

type CacheEntry<Data> = {
  data: Data;
  timestamp: number;
};

const dataCache = new Map<string, CacheEntry<unknown>>();
const inflightRequests = new Map<string, Promise<unknown>>();

function serializeKey(key: SWRKey) {
  if (!key) return null;
  return JSON.stringify(key);
}

async function runFetcher<Data>(cacheKey: string, key: readonly unknown[], fetcher: (key: readonly unknown[]) => Promise<Data>) {
  const existing = inflightRequests.get(cacheKey) as Promise<Data> | undefined;
  if (existing) {
    return existing;
  }

  const request = fetcher(key)
    .then((result) => {
      dataCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    })
    .finally(() => {
      inflightRequests.delete(cacheKey);
    });

  inflightRequests.set(cacheKey, request);
  return request;
}

export default function useSWR<Data>(
  key: SWRKey,
  fetcher: (key: readonly unknown[]) => Promise<Data>,
  options: SWROptions = {}
): SWRResponse<Data> {
  const {
    dedupingInterval = 2_000,
    revalidateOnFocus = true,
    revalidateIfStale = true,
    keepPreviousData = false,
  } = options;

  const serializedKey = useMemo(() => serializeKey(key), [key]);
  const cached = serializedKey ? (dataCache.get(serializedKey) as CacheEntry<Data> | undefined) : undefined;
  const [data, setData] = useState<Data | undefined>(cached?.data);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!serializedKey || !key) {
      setIsLoading(false);
      setError(undefined);
      setData(undefined);
      return;
    }

    let cancelled = false;
    const cacheEntry = dataCache.get(serializedKey) as CacheEntry<Data> | undefined;
    const age = cacheEntry ? Date.now() - cacheEntry.timestamp : Infinity;
    const hasFreshCache = age < dedupingInterval;
    const shouldFetch = !cacheEntry || (!hasFreshCache && revalidateIfStale);

    if (cacheEntry && (hasFreshCache || !revalidateIfStale)) {
      setData(cacheEntry.data);
      setIsLoading(false);
    } else if (!keepPreviousData) {
      setData(undefined);
    }

    if (!shouldFetch) {
      return;
    }

    setIsLoading(true);
    setError(undefined);

    runFetcher(serializedKey, key, fetcher)
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError : new Error("Failed to fetch data"));
          setData(undefined);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dedupingInterval, fetcher, keepPreviousData, key, revalidateIfStale, serializedKey]);

  useEffect(() => {
    if (!revalidateOnFocus || !serializedKey || !key) {
      return;
    }

    const onFocus = () => {
      runFetcher(serializedKey, key, fetcher)
        .then((result) => setData(result))
        .catch((fetchError: unknown) =>
          setError(fetchError instanceof Error ? fetchError : new Error("Failed to fetch data"))
        );
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetcher, key, revalidateOnFocus, serializedKey]);

  return { data, error, isLoading };
}
