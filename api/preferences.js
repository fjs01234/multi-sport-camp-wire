// Vercel serverless function -- persists Noah/Emily's sport+team selections using Vercel KV.
// Requires a Vercel KV store linked to this project (Dashboard -> Storage -> KV),
// which auto-injects KV_REST_API_URL and KV_REST_API_TOKEN as env vars.

import { kv } from '@vercel/kv';

const KEY = 'camp-wire:preferences';

const DEFAULTS = {
  noah:  { sport: 'baseball', league: 'mlb', teamId: '21', teamAbbr: 'NYM', teamName: 'New York Mets' },
  emily: { sport: 'baseball', league: 'mlb', teamId: '21', teamAbbr: 'NYM', teamName: 'New York Mets' }
};

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
      return res.status(200).json(stored || DEFAULTS);
    }

    if (req.method === "POST") {
      const { noah, emily } = req.body || {};
      if (!noah || !emily) {
        return res.status(400).json({ error: "Request body must include both noah and emily selections" });
      }
      const toSave = { noah, emily };
      await kv.set(KEY, toSave);
      return res.status(200).json(toSave);
    }

    return res.status(405).json({ error: "Method not allowed, use GET or POST" });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
