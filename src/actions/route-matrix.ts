import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

type RouteMatrixInput = {
  addresses: string[];
  pairs?: Array<{ from: string; to: string }>;
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
    return buildCachedRouteMatrix(data.addresses, data.pairs);
  });

async function buildCachedRouteMatrix(addresses: string[], requestedPairs?: Array<{ from: string; to: string }>): Promise<RouteMatrixResult> {
  const unique = [...new Set(addresses.map((address) => address.trim()).filter(Boolean))];
  const pairs = requestedPairs?.length
    ? dedupePairs(requestedPairs)
    : unique.flatMap((from) => unique.filter((to) => to !== from).map((to) => ({ from, to })));

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
  const fullMatrixElements = allAddresses.length * Math.max(0, allAddresses.length - 1);
  if (pairs.length < fullMatrixElements) {
    const rows = await Promise.all(pairs.map((pair) => fetchGoogleSinglePair(pair, key)));
    return rows.filter((row): row is RouteMatrixEntry => !!row);
  }

  // Single API call: all addresses as both origins and destinations
  const response = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,status",
    },
    body: JSON.stringify({
      origins: allAddresses.map((address) => ({ waypoint: waypointForAddress(address) })),
      destinations: allAddresses.map((address) => ({ waypoint: waypointForAddress(address) })),
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

async function fetchGoogleSinglePair(pair: { from: string; to: string }, key: string): Promise<RouteMatrixEntry | null> {
  const response = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,status",
    },
    body: JSON.stringify({
      origins: [{ waypoint: waypointForAddress(pair.from) }],
      destinations: [{ waypoint: waypointForAddress(pair.to) }],
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
    }),
  });

  if (!response.ok) return null;
  const data = await response.json();
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || row.status?.code === 3) return null;
  const duration = parseDuration(row.duration);
  if (!duration) return null;
  return {
    from: pair.from,
    to: pair.to,
    duration,
    distance: row.distanceMeters || 0,
    source: "google",
  };
}

function parseDuration(value: string | undefined) {
  if (!value) return 0;
  return Number(value.replace("s", "")) || 0;
}

function waypointForAddress(address: string) {
  const coordinate = parseCoordinateAddress(address);
  if (coordinate) {
    return {
      location: {
        latLng: {
          latitude: coordinate.lat,
          longitude: coordinate.lng,
        },
      },
    };
  }
  return { address };
}

function parseCoordinateAddress(address: string) {
  const match = address.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function pairKey(from: string, to: string) {
  return `${from.trim().toLowerCase()}|||${to.trim().toLowerCase()}`;
}

function dedupePairs(pairs: Array<{ from: string; to: string }>) {
  const seen = new Set<string>();
  return pairs
    .map((pair) => ({ from: pair.from.trim(), to: pair.to.trim() }))
    .filter((pair) => pair.from && pair.to && pair.from !== pair.to)
    .filter((pair) => {
      const key = pairKey(pair.from, pair.to);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function roughDuration(from: string, to: string) {
  return Math.max(15, roughDistance(from, to) * 1.3) * 60;
}

function roughDistance(a: string, b: string) {
  const pointA = parseCoordinateAddress(a) ?? knownPointForAddress(a);
  const pointB = parseCoordinateAddress(b) ?? knownPointForAddress(b);
  if (pointA && pointB) return Math.max(1, haversineKm(pointA, pointB) * 1.35);

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

function knownPointForAddress(address: string) {
  const text = address.toLowerCase();
  if (text.includes("12441") || text.includes("woodbine")) return { lat: 43.948446, lng: -79.374072 };
  if (text.includes("3445") || text.includes("kennedy rd, scarborough")) return { lat: 43.821044, lng: -79.304742 };
  if (text.includes("2967")) return { lat: 43.7756, lng: -79.2621 };
  if (text.includes("150 clark")) return { lat: 43.7015, lng: -79.7240 };
  return null;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const radiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(h));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
