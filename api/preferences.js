// Vercel serverless function -- persists the list of people (each with their own
// sport+team selection, age, and tone preset) using Vercel KV.
// Requires a Vercel KV store linked to this project (Dashboard -> Storage -> KV),
// which auto-injects KV_REST_API_URL and KV_REST_API_TOKEN as env vars.

import { kv } from '@vercel/kv';

const KEY = 'camp-wire:people';

const DEFAULT_PEOPLE = [
  {
    id: 'noah', name: 'Noah', age: 15, gender: 'male', tonePreset: 'teen_stats',
    sport: 'baseball', league: 'mlb', teamId: '21', teamAbbr: 'NYM', teamName: 'New York Mets'
  },
  {
    id: 'emily', name: 'Emily', age: 12, gender: 'female', tonePreset: 'young_enthusiastic',
    sport: 'baseball', league: 'mlb', teamId: '21', teamAbbr: 'NYM', teamName: 'New York Mets'
  }
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    if (req.method === "GET") {
      const stored = await kv.get(KEY);
      return res.status(200).json({ people: stored || DEFAULT_PEOPLE });
    }

    if (req.method === "POST") {
      const { people } = req.body || {};
      if (!Array.isArray(people)) {
        return res.status(400).json({ error: "Request body must include a 'people' array" });
      }
      await kv.set(KEY, people);
      return res.status(200).json({ people });
    }

    return res.status(405).json({ error: "Method not allowed, use GET or POST" });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
