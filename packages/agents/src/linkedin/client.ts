const LINKEDIN_API_BASE = "https://api.linkedin.com/rest";

function getAccessToken(): string | null {
  return process.env.LINKEDIN_ACCESS_TOKEN ?? null;
}

function getOrganizationUrn(): string | null {
  return process.env.LINKEDIN_ORGANIZATION_URN ?? null;
}

export function isLinkedInConfigured(): boolean {
  return !!(getAccessToken() && getOrganizationUrn());
}

type LinkedInPostResponse = {
  id: string;
  urn: string;
};

export async function createLinkedInPost(
  text: string,
  options?: {
    articleUrl?: string;
    articleTitle?: string;
    articleDescription?: string;
    imageUrl?: string;
  },
): Promise<LinkedInPostResponse> {
  const token = getAccessToken();
  const orgUrn = getOrganizationUrn();
  if (!token || !orgUrn) {
    throw new Error("LinkedIn not configured: missing LINKEDIN_ACCESS_TOKEN or LINKEDIN_ORGANIZATION_URN");
  }

  const author = `urn:li:organization:${orgUrn}`;

  const body: Record<string, unknown> = {
    author,
    lifecycleState: "PUBLISHED",
    visibility: "PUBLIC",
    commentary: text,
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
  };

  if (options?.articleUrl) {
    body.content = {
      article: {
        source: options.articleUrl,
        title: options.articleTitle ?? "",
        description: options.articleDescription ?? "",
      },
    };
  }

  const res = await fetch(`${LINKEDIN_API_BASE}/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": "202501",
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`LinkedIn API error ${res.status}: ${errBody}`);
  }

  const id = res.headers.get("x-restli-id") ?? "";
  return { id, urn: `urn:li:share:${id}` };
}

export async function getLinkedInPostAnalytics(
  postUrn?: string,
  days = 7,
): Promise<Record<string, unknown>> {
  const token = getAccessToken();
  const orgUrn = getOrganizationUrn();
  if (!token || !orgUrn) {
    throw new Error("LinkedIn not configured");
  }

  const author = `urn:li:organization:${orgUrn}`;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const params = new URLSearchParams({
    q: "author",
    author,
    start: since,
  });
  if (postUrn) params.set("ugcPostUrn", postUrn);

  const res = await fetch(`${LINKEDIN_API_BASE}/posts?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": "202501",
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`LinkedIn analytics API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  return data as Record<string, unknown>;
}

export async function getLinkedInPageAnalytics(): Promise<{
  followers: number;
  engagement: number;
  impressions: number;
  clicks: number;
}> {
  const token = getAccessToken();
  const orgUrn = getOrganizationUrn();
  if (!token || !orgUrn) {
    throw new Error("LinkedIn not configured");
  }

  const author = `urn:li:organization:${orgUrn}`;
  const timeRange = {
    start: Math.floor((Date.now() - 30 * 86400000) / 1000),
    end: Math.floor(Date.now() / 1000),
  };

  const body = {
    entityUrn: author,
    timeIntervals: [timeRange],
    metrics: [
      "com.linkedin.social.actions.impressionCount",
      "com.linkedin.social.actions.clickCount",
      "com.linkedin.social.actions.engagementCount",
      "com.linkedin.social.actions.followerGainCount",
    ],
  };

  const res = await fetch(`${LINKEDIN_API_BASE}/organizationalEntityShareStatistics`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": "202501",
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    const data = (await res.json()) as Record<string, any>;
    const elements = data?.elements?.[0] ?? {};
    return {
      followers: elements?.followerGainCount ?? 0,
      engagement: elements?.engagementCount ?? 0,
      impressions: elements?.impressionCount ?? 0,
      clicks: elements?.clickCount ?? 0,
    };
  }

  return { followers: 0, engagement: 0, impressions: 0, clicks: 0 };
}
