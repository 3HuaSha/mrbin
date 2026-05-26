import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

type RouteMatrixInput = {
  addresses: string[];
};

export type RouteMatrixEntry = {
  from: string;
  to: string;
  duration: number;
  distance: number;
  source: "cache" | "google" | "fallback";
};

export type RouteMatrixResult = {
  success: boolean;
  error?: string;
  entries: RouteMatrixEntry[];
  cacheHits: number;
  googleElements: number;
  fallbackElements: number;
};

type CacheRow = {
  origin_address: string;
  destination_address: string;
  duration_seconds: number;
  distance_meters: number;
};

export const getCachedRouteMatrix = createServerFn({ method: "POST" })
  .inputValidator((data: RouteMatrixInput) => data)
  .handler(async ({ data }) => {
    return buildCachedRouteMatrix(data.addresses);
  });

async function buildCachedRouteMatrix(addresses: string[]): Promise<RouteMatrixResult> {
  const unique = [...new Set(addresses.map((address) => address.trim()).filter(Boolean))];
  const pairs = unique.flatMap((from) => unique.filter((to) => to !== from).map((to) => ({ from, to })));

  const entries = new Map<string, RouteMatrixEntry>();
  let cacheHits = 0;
  let googleElements = 0;
  let fallbackElements = 0;

  const supabase = createSupabaseClient();

  if (supabase && unique.length > 0) {
    const { data } = await (supabase.from("route_cache") as any)
      .select("origin_address,destination_address,duration_seconds,distance_meters")
      .in("origin_address", unique)
      .in("destination_address", unique);

    ((data || []) as CacheRow[]).forEach((row) => {
      const key = pairKey(row.origin_address, row.destination_address);
      entries.set(key, {
        from: row.origin_address,
        to: row.destination_address,
        duration: row.duration_seconds,
        distance: row.distance_meters,
        source: "cache",
      });
      cacheHits++;
    });
  }

  const missingPairs = pairs.filter((pair) => !entries.has(pairKey(pair.from, pair.to)));

  if (missingPairs.length > 0) {
    const googleRows = await fetchGoogleMatrixForPairs(missingPairs);
    googleRows.forEach((entry) => {
      entries.set(pairKey(entry.from, entry.to), entry);
    });

    const newGoogleRows = googleRows.filter((entry) =>
      missingPairs.some((pair) => pair.from === entry.from && pair.to === entry.to),
    );
    googleElements += newGoogleRows.length;

    if (supabase && newGoogleRows.length > 0) {
      await (supabase.from("route_cache") as any).upsert(
        newGoogleRows.map((entry) => ({
          origin_address: entry.from,
          destination_address: entry.to,
          duration_seconds: Math.round(entry.duration),
          distance_meters: Math.round(entry.distance),
        })),
        { onConflict: "origin_address,destination_address" },
      );
    }
  }

  pairs.forEach((pair) => {
    const key = pairKey(pair.from, pair.to);
    if (!entries.has(key)) {
      fallbackElements++;
      entries.set(key, {
        from: pair.from,
        to: pair.to,
        duration: roughDuration(pair.from, pair.to),
        distance: roughDistance(pair.from, pair.to) * 1000,
        source: "fallback",
      });
    }
  });

  return {
    success: true,
    entries: [...entries.values()].filter((entry) => entry.from !== entry.to),
    cacheHits,
    googleElements,
    fallbackElements,
  };
}

function createSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function fetchGoogleMatrixForPairs(pairs: Array<{ from: string; to: string }>): Promise<RouteMatrixEntry[]> {
  const key = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key || pairs.length === 0) return [];

  // Collect all unique addresses from the pairs
  const addressSet = new Set<string>();
  pairs.forEach((pair) => {
    addressSet.add(pair.from);
    addressSet.add(pair.to);
  });
  const allAddresses = [...addressSet];

  // Single API call: all addresses as both origins and destinations
  const response = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,status",
    },
    body: JSON.stringify({
      origins: allAddresses.map((address) => ({ waypoint: { address } })),
      destinations: allAddresses.map((address) => ({ waypoint: { address } })),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
    }),
  });

  if (!response.ok) return [];
  const data = await response.json();
  const rows = Array.isArray(data) ? data : [];

  const entries: RouteMatrixEntry[] = rows
    .filter((row) => row.status?.code !== 3)
    .map((row) => ({
      from: allAddresses[row.originIndex],
      to: allAddresses[row.destinationIndex],
      duration: parseDuration(row.duration),
      distance: row.distanceMeters || 0,
      source: "google" as const,
    }))
    .filter((entry) => entry.duration > 0 && entry.from !== entry.to);

  return entries;
}

function parseDuration(value: string | undefined) {
  if (!value) return 0;
  return Number(value.replace("s", "")) || 0;
}

function pairKey(from: string, to: string) {
  return `${from.trim().toLowerCase()}|||${to.trim().toLowerCase()}`;
}

function roughDuration(from: string, to: string) {
  return Math.max(15, roughDistance(from, to) * 1.3) * 60;
}

function roughDistance(a: string, b: string) {
  const text = `${a} ${b}`.toLowerCase();
  const west = ["oakville", "milton", "brampton", "georgetown"];
  const east = ["pickering", "scarborough"];
  const north = ["vaughan", "thornhill", "markham"];
  const aw = west.some((item) => a.toLowerCase().includes(item));
  const bw = west.some((item) => b.toLowerCase().includes(item));
  const ae = east.some((item) => a.toLowerCase().includes(item));
  const be = east.some((item) => b.toLowerCase().includes(item));
  const an = north.some((item) => a.toLowerCase().includes(item));
  const bn = north.some((item) => b.toLowerCase().includes(item));
  if ((aw && bw) || (ae && be) || (an && bn)) return 18;
  if (text.includes("12441")) return 35;
  return 55;
}
