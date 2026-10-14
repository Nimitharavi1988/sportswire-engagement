// Pure parsers for YouTube Data API v3 responses (channels.list, playlistItems.list, videos.list), kept apart
// from the network code so they can be tested without a key.

const num = (v: unknown): number | null => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export interface ChannelStats { subscribers: number | null; views: number | null; videos: number | null; uploadsPlaylist: string | null }

// A channel can hide its subscriber count (hiddenSubscriberCount): then it is null, not 0.
export function parseChannel(json: any): ChannelStats | null {
  const c = json?.items?.[0];
  if (!c) return null;
  const s = c.statistics ?? {};
  return {
    subscribers: s.hiddenSubscriberCount ? null : num(s.subscriberCount),
    views: num(s.viewCount),
    videos: num(s.videoCount),
    uploadsPlaylist: c.contentDetails?.relatedPlaylists?.uploads ?? null,
  };
}

export function parsePlaylistIds(json: any): string[] {
  return (json?.items ?? []).map((i: any) => i?.contentDetails?.videoId ?? i?.snippet?.resourceId?.videoId).filter((v: unknown): v is string => typeof v === "string");
}

// "PT1M5S" -> 65, "PT12S" -> 12, "PT1H" -> 3600.
export function parseIsoDuration(d: unknown): number | null {
  const m = typeof d === "string" ? d.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/) : null;
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : null;
}

export interface VideoRow { id: string; title: string; publishedAt: string | null; durationS: number | null; views: number | null; likes: number | null; comments: number | null }

export function parseVideos(json: any): VideoRow[] {
  return (json?.items ?? []).map((v: any) => ({
    id: String(v.id),
    title: String(v.snippet?.title ?? ""),
    publishedAt: v.snippet?.publishedAt ?? null,
    durationS: parseIsoDuration(v.contentDetails?.duration),
    views: num(v.statistics?.viewCount),
    likes: num(v.statistics?.likeCount),
    comments: num(v.statistics?.commentCount),
  }));
}
