import { useEffect, useMemo, useState } from "react";

type SWRKey = readonly unknown[] | null;

type SWROptions = {
  dedupingInterval?: number;
  revalidateOnFocus?: boolean;
  revalidateOnReconnect?: boolean;
  revalidateIfStale?: boolean;
};

type SWRResponse<Data> = {
  data: Data | undefined;
  isLoading: boolean;
  isValidating: boolean;
};

const cache = new Map<string, { data: unknown; timestamp: number }>();
const inFlight = new Map<string, Promise<unknown>>();

function serializeKey(key: SWRKey) {
  if (!key) return null;
  return JSON.stringify(key);
}

export default function useSWR<Data, K extends readonly unknown[]>(
  key: K | null,
  fetcher: (key: K) => Promise<Data>,
  options: SWROptions = {}
): SWRResponse<Data> {
  const serializedKey = useMemo(() => serializeKey(key), [key]);
  const dedupingInterval = options.dedupingInterval ?? 2000;
  const [data, setData] = useState<Data | undefined>(() => {
    if (!serializedKey) return undefined;
    const cached = cache.get(serializedKey);
    return cached?.data as Data | undefined;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    if (!serializedKey || !key) {
      setData(undefined);
      setIsLoading(false);
      setIsValidating(false);
      return;
    }

    let cancelled = false;
    const cached = cache.get(serializedKey);
    const isFresh = cached && Date.now() - cached.timestamp < dedupingInterval;

    if (cached) {
      setData(cached.data as Data);
      setIsLoading(false);
    } else {
      setData(undefined);
      setIsLoading(true);
    }

    if (isFresh && options.revalidateIfStale === false) {
      setIsValidating(false);
      return;
    }

    const pending = inFlight.get(serializedKey) as Promise<Data> | undefined;
    const request = pending ?? fetcher(key);

    if (!pending) {
      inFlight.set(serializedKey, request);
    }

    setIsValidating(true);

    request
      .then((nextData) => {
        if (cancelled) return;
        cache.set(serializedKey, { data: nextData, timestamp: Date.now() });
        setData(nextData);
      })
      .catch(() => {
        if (cancelled) return;
        setData(undefined);
      })
      .finally(() => {
        if (inFlight.get(serializedKey) === request) {
          inFlight.delete(serializedKey);
        }

        if (cancelled) return;
        setIsLoading(false);
        setIsValidating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dedupingInterval, fetcher, key, options.revalidateIfStale, serializedKey]);

  useEffect(() => {
    if (!options.revalidateOnFocus || !serializedKey || !key) {
      return;
    }

    const handleFocus = () => {
      const cached = cache.get(serializedKey);
      if (cached) {
        setData(cached.data as Data);
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [key, options.revalidateOnFocus, serializedKey]);

  useEffect(() => {
    if (!options.revalidateOnReconnect || !serializedKey || !key) {
      return;
    }

    const handleOnline = () => {
      const cached = cache.get(serializedKey);
      if (cached) {
        setData(cached.data as Data);
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [key, options.revalidateOnReconnect, serializedKey]);

  return { data, isLoading, isValidating };
}
