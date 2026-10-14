# sportswire-engagement
Comment/reply/moderation + insights bot for SportsWire social Pages. Separate from the website repo so
nothing here triggers a site deploy. Pilot: Cricket Live and US Live (FB + IG). Dry-run by default.
Plan: ingest comments -> classify -> dry-run replies -> (ENGAGEMENT_LIVE=1) like/hide/reply -> insights + breakout posts.

## Followers and YouTube (read-only measurement)
- `npm run followers` stores each Page's and Instagram account's follower count in `follower_snapshot` (run every 6 hours by `followers.yml`).
- `npm run youtube` stores each YouTube channel's subscribers (`follower_snapshot`, platform `yt`) and the public counters of its newest 50 uploads (`yt_metric`). It needs a repo secret `YOUTUBE_API_KEY` (Google Cloud > Credentials > API key, restricted to the YouTube Data API v3); without it the step skips itself. Channels are listed in `src/config.ts` (`YOUTUBE_CHANNELS`).
- `npm run followers:report` prints followers per account with the change over 24 hours and 7 days.
- `npm test` runs the YouTube response parsers' tests (no key needed).
