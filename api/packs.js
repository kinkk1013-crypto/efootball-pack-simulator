const ORIGIN = "https://efhub.com";

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
      "user-agent": "Mozilla/5.0 (compatible; eFootballPackSimulator/1.0)",
      "accept": "text/html,application/xhtml+xml"
    }
  });

  if (!r.ok) throw new Error("eFHUB HTTP " + r.status);
  return await r.text();
}

function parseNewPlayers(html) {
  const groups = [];

  const h2 = [
    ...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)
  ];

  for (let i = 0; i < h2.length; i++) {
    const title = clean(h2[i][1]);

   
