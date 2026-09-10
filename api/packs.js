const ORIGIN = "https://efhub.com";

const OPENAI_MODEL =
  process.env.OPENAI_VISION_MODEL ||
  "gpt-5.6-luna";

function clean(s = "") {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function getHTML(url) {
  const r = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; eFootballPackSimulator/1.0)",
      "accept":
        "text/html,application/xhtml+xml"
    }
  });

  if (!r.ok) {
    throw new Error(
      "eFHUB HTTP " + r.status
    );
  }

  return await r.text();
}

function parseNewPlayers(html) {
  const groups = [];

  const headings = [
    ...html.matchAll(
      /<h2[^>]*>([\s\S]*?)<\/h2>/gi
    )
  ];

  for (
    let i = 0;
    i < headings.length;
    i++
  ) {
    const title =
      clean(headfunction releaseDateFromTitle(title) {
  const m = title.match(
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+'?(\d{2})/i
  );

  if (!m) {
    return "Latest";
  }

  return `${Number(m[1])} ${m[2]} 20${m[3]}`;
}

function cardImageFromId(id) {
  return `https://boooost.jp/img/p/${id}.webp`;
}

function textDecision(group) {
  if (
    group.players.length !== 11
  ) {
    return "REJECT";
  }

  const t =
    group.title.toLowerCase();

  const hardReject = [
    "potw",
    "rewards",
    "manager pack",
    "national teams selection",
    "european clubs selection",
    "anticipated standouts",
    "gracias"
  ];

  if (
    hardReject.some(
      x => t.includes(x)
    )
  ) {
    return "REJECT";
  }

  const obviousPremium = [
    "epic",
    "show time",
    "showtime",
    "summer transfer",
    "guardians",
    "snap strike"
  ];

  if (
    obviousPremium.some(
      x => t.includes(x)
    )
  ) {
    return "ACCEPT";
  }

  return "AI";
}

function getResponseText(data) {
  if (
    typeof data?.output_text ===
    "string"
  ) {
    return data.output_text;
  }

  const pieces = [];

  for (
    const item of
      data?.output || []
  ) {
    for (
      const content of
        item?.content || []
    ) {
      if (
        content?.type ===
          "output_text" &&
        typeof content?.text ===
          "string"
      ) {
        pieces.push(
          content.text
        );
      }
    }
  }

  return pieces.join("\n");
}async function aiLooksPremium(group) {
  const key =
    process.env.OPENAI_API_KEY;

  if (!key) {
    return false;
  }

  const first3 =
    group.players.slice(0, 3);

  if (first3.length < 3) {
    return false;
  }

  const content = [
    {
      type: "input_text",
      text:
        `You classify eFootball card releases. ` +
        `The release title is "${group.title}". ` +
        `Look at the THREE card images. ` +
        `Decide whether these visually look like the three featured premium cards ` +
        `from a 150-player Epic/Show Time style box, rather than an ordinary Selection, POTW, reward, or standard highlight release. ` +
        `Return only PREMIUM or OTHER.`
    },

    ...first3.map(
      p => ({
        type: "input_image",
        image_url:
          cardImageFromId(p.id),
        detail: "low"
      })
    )
  ];

  try {
    const r = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          "Authorization":
            `Bearer ${key}`,
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          model: OPENAI_MODEL,

          input: [
            {
              role: "user",
              content
            }
          ],

          reasoning: {
            effort: "low"
          },

          max_output_tokens: 20
        })
      }
    );

    if (!r.ok) {
      console.warn(
        "OpenAI vision HTTP",
        r.status,
        await r.text()
      );

      return false;
    }

    const data =
      await r.json();

    const answer =
      getResponseText(data)
        .trim()
        .toUpperCase();

    return answer.startsWith(
      "PREMIUM"
    );async function choosePremiumGroups(groups) {
  const chosen = [];
  const aiCandidates = [];

  for (const group of groups) {
    if (chosen.length >= 3) break;

    const decision =
      textDecision(group);

    if (decision === "ACCEPT") {
      chosen.push(group);
    } else if (decision === "AI") {
      aiCandidates.push(group);
    }
  }

  for (const group of aiCandidates) {
    if (chosen.length >= 3) break;

    const isPremium =
      await aiLooksPremium(group);

    if (isPremium) {
      chosen.push(group);
    }
  }

  return chosen.slice(0, 3);
}

export default async function handler(
  req,
  res
) {
  const checkedAt =
    new Date().toISOString();

  try {
    const html =
      await getHTML(
        `${ORIGIN}/new-players`
      );

    const groups =
      parseNewPlayers(html);

    const selected =
      await choosePremiumGroups(
        groups
      );

    const packs =
      selected.map(toPack);

    res.setHeader(
      "Cache-Control",
      "s-maxage=900, stale-while-revalidate=1800"
    );

    return res
      .status(200)
      .json({
        packs,
        checkedAt,
        source:
          "eFHUB /new-players",
        imageSource:
          "boooost player-id cards",
        aiVision:
          Boolean(
            process.env.OPENAI_API_KEY
          ),
        aiModel:
          process.env.OPENAI_API_KEY
            ? OPENAI_MODEL
            : null
      });

  } catch (error) {
    return res
      .status(200)
      .json({
        packs: [],
        checkedAt,
        source: "eFHUB",
        aiVision:
          Boolean(
            process.env.OPENAI_API_KEY
          ),
        error:
          String(error)
      });
  }
}
