// Vercel serverless function -- AI-written sport recap emails for any added person.
// Voice is driven by a tonePreset chosen when the person was added, not hardcoded names.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

const SPORT_LABELS = {
  baseball: "baseball",
  basketball: "basketball",
  football: "football"
};

const TONE_VOICES = {
  teen_stats: `Voice: talk to them like a fellow sports fan who follows the team closely. Use real terminology for the sport (the relevant stats, positions, league standings language). Dry humor is welcome. Do not be cutesy or oversimplify -- they want real analysis, not hype.`,
  young_enthusiastic: `Voice: warm, upbeat, simple language. A little enthusiasm is great, but keep it light -- one exclamation point here and there is enough, not every sentence. Avoid extreme phrasing or repeated words for emphasis (no "so so much," no stacking multiple "!!"). Mention a fun highlight or two by name. End on a warm, low-key note, like "Love you, Dad" -- not a big emotional declaration.`,
  casual_fan: `Voice: friendly and easygoing, like catching someone up who likes the team but doesn't obsess over every stat. Keep it conversational, hit the headline result and one or two fun details, skip deep stat breakdowns.`
};

const DEFAULT_TONE = 'casual_fan';

function pronouns(gender) {
  if (gender === 'female') return { subj: 'she', obj: 'her', poss: 'her', child: 'daughter' };
  if (gender === 'male')   return { subj: 'he',  obj: 'him', poss: 'his', child: 'son' };
  return { subj: 'they', obj: 'them', poss: 'their', child: 'child' };
}

function buildSystemPrompt(recipientName, age, voice, sportWord, gender) {
  const p = pronouns(gender);
  return `You are ghost-writing a short daily ${sportWord} recap email from a dad to his ${age} year old ${p.child} ${recipientName}, who is away at sleepaway camp.

${voice}

IMPORTANT: Do not reference ${p.obj} coming home, returning from camp, seeing ${p.obj} "when ${p.subj} gets back," or anything about the end of the camp session. This should read as an in-the-moment daily note, not a goodbye or homecoming message.

You will be given structured JSON with the day's game facts for the specific team and sport ${recipientName} follows: score, top performers (player stat lines), news headlines, injuries, and roster moves. Weave the most interesting 1-2 of these into the narrative naturally where relevant -- don't ignore them, but don't try to cram in everything either. Do NOT invent any stats, names, or facts not present in the data. If the data says no game today, say so plainly.

Output ONLY the body text of the email (no subject line, no greeting -- the app adds those separately). Write 2-4 short paragraphs max, tight and skimmable.`;
}

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

    const { recipientName, age, sport, tonePreset, gender, gameData } = req.body || {};
    if (!recipientName || !gameData) {
      return res.status(400).json({ error: "Missing recipientName or gameData in request body" });
    }

    const ageVal = age || 12;
    const voice = TONE_VOICES[tonePreset] || TONE_VOICES[DEFAULT_TONE];
    const sportWord = SPORT_LABELS[sport] || 'sports';
    const system = buildSystemPrompt(recipientName, ageVal, voice, sportWord, gender);

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
