// Vercel serverless function -- persists the list of people (each with their own
// teams, age, and tone preset) using Upstash Redis.
// Vercel KV was sunset; this uses @upstash/redis directly against whichever
// env var names the Upstash integration injected (KV_REST_API_* or UPSTASH_REDIS_REST_*).

import { Redis } from '@upstash/redis';

const KEY = 'camp-wire:people';

const DEFAULT_PEOPLE = [
  {
    id: 'noah', name: 'Noah', age: 15, gender: 'male', tonePreset: 'teen_stats',
    teams: [{ sport: 'baseball', league: 'mlb', teamId: '21', teamAbbr: 'NYM', teamName: 'New York Mets' }]
  },
  {
    id: 'emily', name: 'Emily', age: 12, gender: 'female', tonePreset: 'young_enthusiastic',
    teams: [{ sport: 'baseball', league: 'mlb', teamId: '21', teamAbbr: 'NYM', teamName: 'New York Mets' }]
  }
];

function getRedis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Missing Redis env vars. Need KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN. " +
      "Connect an Upstash Redis database to this project under Vercel -> Storage, then redeploy."
    );
  }
  return new Redis({ url, token });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const redis = getRedis();

    if (req.method === "GET") {
      const stored = await redis.get(KEY);
      return res.status(200).json({ people: stored || DEFAULT_PEOPLE });
    }

    if (req.method === "POST") {
      const { people } = req.body || {};
      if (!Array.isArray(people)) {
        return res.status(400).json({ error: "Request body must include a 'people' array" });
      }
      await redis.set(KEY, people);
      return res.status(200).json({ people });
    }

    return res.status(405).json({ error: "Method not allowed, use GET or POST" });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
