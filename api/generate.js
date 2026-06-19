// Vercel serverless function -- AI-written sport recap emails for Noah and Emily
// Generalized from Mets Camp Wire to support any team across MLB, NBA, and NFL.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

const SPORT_LABELS = {
  baseball: "baseball",
  basketball: "basketball",
  football: "football"
};

function buildSystemPrompt(recipientName, age, voice, sportWord) {
  return `You are ghost-writing a short daily ${sportWord} recap email from a dad to his ${age} year old ${recipientName === 'Noah' ? 'son' : 'daughter'} ${recipientName}, who is away at sleepaway camp.

${voice}

IMPORTANT: Do not reference ${recipientName === 'Noah' ? 'him' : 'her'} coming home, returning from camp, seeing ${recipientName === 'Noah' ? 'him' : 'her'} "when ${recipientName === 'Noah' ? 'he' : 'she'} gets back," or anything about the end of the camp session. This should read as an in-the-moment daily note, not a goodbye or homecoming message.

You will be given structured JSON with the day's game facts for the specific team and sport ${recipientName} follows: score, top performers (player stat lines), news headlines, injuries, and roster moves. Weave the most interesting 1-2 of these into the narrative naturally where relevant -- don't ignore them, but don't try to cram in everything either. Do NOT invent any stats, names, or facts not present in the data. If the data says no game today, say so plainly.

Output ONLY the body text of the email (no subject line, no greeting -- the app adds those separately). Write 2-4 short paragraphs max, tight and skimmable.`;
}

const NOAH_VOICE = `Voice: talk to Noah like a fellow sports fan who follows the team closely. Use real terminology for the sport (the relevant stats, positions, league standings language). Dry humor is welcome. Do not be cutesy or oversimplify -- Noah wants real analysis, not hype.`;

const EMILY_VOICE = `Voice: warm, upbeat, simple language. A little enthusiasm is great, but keep it light -- one exclamation point here and there is enough, not every sentence. Avoid extreme phrasing or repeated words for emphasis (no "so so much," no stacking multiple "!!"). Mention a fun highlight or two by name. End on a warm, low-key note, like "Love you, Dad" -- not a big emotional declaration.`;

function buildUserPrompt(gameData) {
  return `Here is today's data as JSON for the team and sport this recipient follows. Write the email body now, following your system instructions exactly. Only use facts present below.\n\n${JSON.stringify(gameData, null, 2)}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed, use POST" });
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server missing ANTHROPIC_API_KEY env var" });
    }

    const { recipient, recipientName, age, sport, gameData } = req.body || {};
    if (!recipient || !gameData) {
      return res.status(400).json({ error: "Missing recipient or gameData in request body" });
    }

    const name = recipientName || (recipient === 'emily' ? 'Emily' : 'Noah');
    const ageVal = age || (recipient === 'emily' ? 12 : 15);
    const voice = recipient === 'emily' ? EMILY_VOICE : NOAH_VOICE;
    const sportWord = SPORT_LABELS[sport] || 'sports';
    const system = buildSystemPrompt(name, ageVal, voice, sportWord);

    const anthropicRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system,
        messages: [{ role: "user", content: buildUserPrompt(gameData) }]
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return res.status(502).json({ error: `Anthropic API ${anthropicRes.status}: ${errText}` });
    }

    const data = await anthropicRes.json();
    const text = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n")
      .trim();

    if (!text) {
      return res.status(502).json({ error: "Anthropic API returned no text content" });
    }

    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
