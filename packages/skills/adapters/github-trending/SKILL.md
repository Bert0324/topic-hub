---
name: github-trending
description: Scrapes GitHub Trending page and transforms top repositories into Topic Hub events
sourceSystem: github-trending
executor: none
---

# GitHub Trending Adapter

Fetches and parses the [GitHub Trending](https://github.com/trending) page to extract
the top 10 trending repositories. Since GitHub does not expose a public API for trending
data, this adapter scrapes the HTML page and extracts structured repo metadata.

## Capabilities

- **HTML scraping**: Fetches `https://github.com/trending` with configurable time period
  (daily / weekly / monthly).
- **Structured extraction**: Parses each `<article>` element to extract owner, name,
  description, language, total stars, forks, and "stars today" count.
- **Webhook transform**: Accepts pre-fetched HTML or structured repo arrays via
  `transformWebhook`, returning a `TopicEventPayload` with full trending snapshot.
- **Standalone fetch**: Exports `fetchTrending()` for direct programmatic use.

## Payload Formats

### Trigger via webhook (pre-fetched HTML)

```json
{
  "html": "<full GitHub trending HTML>",
  "period": "daily"
}
```

### Trigger via webhook (pre-parsed repos)

```json
{
  "repos": [{ "rank": 1, "owner": "...", "name": "...", ... }],
  "period": "daily"
}
```

## Rate Limits

GitHub may rate-limit or block scraping requests. Use reasonable intervals
(no more than once per hour) and respect `robots.txt`.
