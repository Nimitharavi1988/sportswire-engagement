import test from "node:test";
import assert from "node:assert/strict";
import { parseChannel, parsePlaylistIds, parseIsoDuration, parseVideos } from "./youtubeParse";

test("parseChannel reads counts and the uploads playlist", () => {
  const c = parseChannel({ items: [{ statistics: { subscriberCount: "42", viewCount: "1234", videoCount: "30" }, contentDetails: { relatedPlaylists: { uploads: "UU123" } } }] });
  assert.deepEqual(c, { subscribers: 42, views: 1234, videos: 30, uploadsPlaylist: "UU123" });
});

test("parseChannel gives null subscribers when the channel hides them, and null for an unknown channel", () => {
  const hidden = parseChannel({ items: [{ statistics: { hiddenSubscriberCount: true, subscriberCount: "0", viewCount: "5", videoCount: "1" } }] });
  assert.equal(hidden?.subscribers, null);
  assert.equal(parseChannel({ items: [] }), null);
  assert.equal(parseChannel({}), null);
});

test("parsePlaylistIds takes video ids from either response shape", () => {
  assert.deepEqual(parsePlaylistIds({ items: [{ contentDetails: { videoId: "a" } }, { snippet: { resourceId: { videoId: "b" } } }, {}] }), ["a", "b"]);
});

test("parseIsoDuration", () => {
  assert.equal(parseIsoDuration("PT12S"), 12);
  assert.equal(parseIsoDuration("PT1M5S"), 65);
  assert.equal(parseIsoDuration("PT1H"), 3600);
  assert.equal(parseIsoDuration("nonsense"), null);
});

test("parseVideos keeps missing counters as null (likes can be hidden), never 0", () => {
  const [v] = parseVideos({ items: [{ id: "x", snippet: { title: "T", publishedAt: "2026-10-12T00:00:00Z" }, contentDetails: { duration: "PT13S" }, statistics: { viewCount: "300", commentCount: "2" } }] });
  assert.deepEqual(v, { id: "x", title: "T", publishedAt: "2026-10-12T00:00:00Z", durationS: 13, views: 300, likes: null, comments: 2 });
});
