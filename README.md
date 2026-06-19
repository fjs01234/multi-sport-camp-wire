# Multi-Sport Camp Wire

Daily AI-assisted sports recap emails for Noah and Emily, supporting any team across MLB, NBA, and NFL (independently selectable per kid, saved persistently).

This is a separate, independent app from the original `mets-camp-wire` repo, which is untouched.

## Setup steps (one-time)

### 1. Deploy to Vercel
Connect this GitHub repo to a new Vercel project the same way the original Mets Camp Wire was set up.

### 2. Add the Anthropic API key
Project Settings -> Environment Variables -> add `ANTHROPIC_API_KEY` (same key/account as the Mets app, or a new one). Apply to Production (and Preview if you want).

### 3. Create a Vercel KV store (for saving team picks)
This is new -- the original app didn't need a database, but this one needs to remember Noah and Emily's team selections between visits.

1. In the Vercel dashboard, go to **Storage** tab
2. Click **Create Database** -> choose **KV**
3. Give it a name (e.g. `camp-wire-kv`)
4. **Connect it to this project** when prompted (this is the step that actually wires up the environment variables)
5. Once connected, Vercel automatically injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` as environment variables -- you don't need to copy/paste anything yourself
6. Redeploy the project once the KV store is connected, so the new env vars are picked up

### 4. Test it
Open the deployed URL. You should see a Team Settings panel where Noah and Emily can each pick a league (MLB/NBA/NFL) and a team. Pick teams, click **Save Team Picks**, then **Generate Today's Emails**.

## What's different from Mets Camp Wire

- Supports MLB, NBA, and NFL (not just the Mets)
- Each kid has an independent team+league selection, saved in Vercel KV
- Box score / player stat formatting is sport-aware (baseball batting/pitching lines, basketball points/rebounds/assists, football passing/rushing/receiving)
- Everything else (AI-written narrative + exact-stat template hybrid, fallback on AI failure, error surfacing) works the same way as the Mets version

## Known risk areas to test carefully

Because NFL and NBA box score data shapes were built from documentation/research rather than fully verified against live game data in this build session, these are the areas most likely to need a fix once tested against a real game day:

- NBA per-player stat line formatting (`teamBlock.statistics[].athletes[]` key names: `points`, `rebounds`, `assists`, etc.)
- NFL per-player stat line formatting, especially distinguishing passing vs rushing vs receiving stat groups
- The `/api/proxy/teams/:sport/:league` endpoint's exact JSON nesting (`sports[0].leagues[0].teams`) -- verify the team picker dropdowns actually populate correctly for all three leagues
- Game-finding logic (`findTeamGame`) for in-progress/live games across NBA and NFL, where "live" status text may differ from MLB's wording
