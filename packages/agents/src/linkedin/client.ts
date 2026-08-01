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

async function uploadImage(
  token: string,
  author: string,
  imageUrl: string,
): Promise<string> {
  const initRes = await fetch(`${LINKEDIN_API_BASE}/images?action=initializeUpload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": "202607",
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: author,
      },
    }),
  });

  if (!initRes.ok) {
    const errBody = await initRes.text();
    throw new Error(`LinkedIn image upload init error ${initRes.status}: ${errBody}`);
  }

  const initData = (await initRes.json()) as {
    value?: { uploadUrlExpiresAt?: number; uploadUrl?: string; image?: string };
  };
  const uploadUrl = initData?.value?.uploadUrl;
  const imageId = initData?.value?.image;
  if (!uploadUrl || !imageId) {
    throw new Error("LinkedIn image upload init failed: no upload URL or image ID returned");
  }

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to fetch image from ${imageUrl}: ${imgRes.status}`);
  }
  const imgBuffer = await imgRes.arrayBuffer();

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: imgBuffer,
  });

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text();
    throw new Error(`LinkedIn image upload error ${uploadRes.status}: ${errBody}`);
  }

  return imageId;
}

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

  const media: Array<Record<string, unknown>> = [];

  if (options?.imageUrl) {
    try {
      const imageId = await uploadImage(token, author, options.imageUrl);
      media.push({
        id: imageId,
        mediaCategory: "IMAGE",
      });
    } catch (err) {
      console.warn(`Failed to upload image for LinkedIn post: ${(err as Error).message}`);
    }
  }

  if (options?.articleUrl) {
    body.content = {
      article: {
        source: options.articleUrl,
        title: options.articleTitle ?? "",
        description: options.articleDescription ?? "",
      },
    };
  }

  if (media.length > 0) {
    body.media = media;
  }

  const res = await fetch(`${LINKEDIN_API_BASE}/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": "202607",
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    const lowerBody = errBody.toLowerCase();
    const isScopeError =
      res.status === 400 || res.status === 401 || res.status === 403
        ? /(permission|permissions|scope|authoriz|not authorized|forbidden|w_organization_social|worganizationsocial)/.test(lowerBody)
        : false;
    if (isScopeError) {
      throw new Error(
        "LinkedIn API error: the access token lacks the 'w_organization_social' scope needed to publish posts as the organization. " +
        "Generate a new token with 'w_organization_social' (and 'r_organization_social' for reading posts/analytics) selected " +
        "in the LinkedIn Developer Portal (https://developer.linkedin.com) → your app → Auth → OAuth 2.0 scopes. " +
        `Original error: ${errBody.slice(0, 300)}`,
      );
    }
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
      "LinkedIn-Version": "202607",
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });

  if (!res.ok) {
    const errBody = await res.text();
    const lowerBody = errBody.toLowerCase();
    const isScopeError =
      res.status === 401 || res.status === 403
        ? /(permission|permissions|scope|authoriz|not authorized|forbidden|r_organization_social|rorganizationsocial)/.test(lowerBody)
        : false;
    if (isScopeError) {
      throw new Error(
        `LinkedIn analytics API error ${res.status}: the access token lacks the 'r_organization_social' scope needed to read posts and analytics. ` +
        `Add it in the LinkedIn Developer Portal (https://developer.linkedin.com) → your app → Auth → OAuth 2.0 scopes, then generate a new token. ` +
        `Original error: ${errBody.slice(0, 300)}`,
      );
    }
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
      "LinkedIn-Version": "202607",
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

  const errBody = await res.text().catch(() => "");
  const lowerBody = errBody.toLowerCase();
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `LinkedIn analytics API error ${res.status}: the access token lacks the 'r_organization_social' scope needed to read page analytics. ` +
      `Add it in the LinkedIn Developer Portal (https://developer.linkedin.com) → your app → Auth → OAuth 2.0 scopes, then generate a new token. ` +
      `Original error: ${errBody.slice(0, 300)}`,
    );
  }

  return { followers: 0, engagement: 0, impressions: 0, clicks: 0 };
}
