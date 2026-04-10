import type {
  AdapterSkill,
  AdapterSkillManifest,
  TopicEventPayload,
} from '@topichub/core';

export interface TrendingRepo {
  rank: number;
  owner: string;
  name: string;
  url: string;
  description: string;
  language: string;
  totalStars: number;
  forks: number;
  starsToday: number;
}

type TrendingPeriod = 'daily' | 'weekly' | 'monthly';

const ARTICLE_RE =
  /<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>([\s\S]*?)<\/article>/g;

function extractText(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Parses GitHub Trending page HTML and returns the top repos.
 * Resilient to minor markup changes — falls back to empty strings
 * for optional fields rather than throwing.
 */
export function parseTrendingHtml(html: string, limit = 10): TrendingRepo[] {
  const repos: TrendingRepo[] = [];
  let match: RegExpExecArray | null;
  let rank = 0;

  while ((match = ARTICLE_RE.exec(html)) !== null && rank < limit) {
    const article = match[1];

    const repoLink = article.match(
      /<h2[^>]*>[\s\S]*?<a[^>]*href="\/([^"]+)"[^>]*>/,
    );
    if (!repoLink) continue;

    const parts = repoLink[1].split('/');
    if (parts.length < 2) continue;
    const [owner, name] = parts;

    rank++;

    const descBlock = article.match(
      /<p[^>]*class="[^"]*(?:color-fg-muted|text-normal)[^"]*"[^>]*>([\s\S]*?)<\/p>/,
    );
    const description = descBlock ? extractText(descBlock[1]) : '';

    const langBlock = article.match(
      /itemprop="programmingLanguage"[^>]*>([^<]+)</,
    );
    const language = langBlock ? langBlock[1].trim() : '';

    const starsBlock = article.match(
      /\/stargazers[^>]*>[\s\S]*?([\d,]+)/,
    );
    const totalStars = starsBlock
      ? parseInt(starsBlock[1].replace(/,/g, ''), 10)
      : 0;

    const forksBlock = article.match(
      /\/forks[^>]*>[\s\S]*?([\d,]+)/,
    );
    const forks = forksBlock
      ? parseInt(forksBlock[1].replace(/,/g, ''), 10)
      : 0;

    const starsTodayBlock = article.match(
      /([\d,]+)\s+stars?\s+today/,
    );
    const starsToday = starsTodayBlock
      ? parseInt(starsTodayBlock[1].replace(/,/g, ''), 10)
      : 0;

    repos.push({
      rank,
      owner,
      name,
      url: `https://github.com/${owner}/${name}`,
      description,
      language,
      totalStars,
      forks,
      starsToday,
    });
  }

  return repos;
}

/**
 * Directly fetches and parses GitHub Trending.
 * Useful outside the webhook pipeline (CLI scripts, cron jobs).
 */
export async function fetchTrending(
  period: TrendingPeriod = 'daily',
): Promise<TrendingRepo[]> {
  const query = period === 'daily' ? '' : `?since=${period}`;
  const res = await fetch(`https://github.com/trending${query}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TopicHub/1.0)',
      Accept: 'text/html',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch GitHub Trending: ${res.status}`);
  }

  return parseTrendingHtml(await res.text());
}

function buildPayload(
  repos: TrendingRepo[],
  period: string,
): TopicEventPayload {
  const date = new Date().toISOString().split('T')[0];

  return {
    type: 'github-trending',
    title: `GitHub Trending Top ${repos.length} — ${date} (${period})`,
    sourceUrl: 'https://github.com/trending',
    status: 'open',
    metadata: {
      period,
      snapshotDate: date,
      repos,
      totalStarsToday: repos.reduce((s, r) => s + r.starsToday, 0),
      languages: [...new Set(repos.map((r) => r.language).filter(Boolean))],
    },
    tags: ['github', 'trending', 'open-source', period],
  };
}

export const githubTrendingAdapter: AdapterSkill = {
  manifest: {
    name: 'github-trending',
    sourceSystem: 'github-trending',
    version: '1.0.0',
    webhookPath: '/webhook/github-trending',
    supportedEvents: ['trending_snapshot'],
  } satisfies AdapterSkillManifest,

  transformWebhook(
    payload: unknown,
    _headers: Record<string, string>,
  ): TopicEventPayload | null {
    const data = payload as {
      html?: string;
      repos?: TrendingRepo[];
      period?: string;
    };

    const period = data.period ?? 'daily';
    let repos: TrendingRepo[];

    if (data.repos && Array.isArray(data.repos)) {
      repos = data.repos.slice(0, 10);
    } else if (data.html && typeof data.html === 'string') {
      repos = parseTrendingHtml(data.html);
    } else {
      return null;
    }

    if (repos.length === 0) return null;

    return buildPayload(repos, period);
  },
};

export default githubTrendingAdapter;
