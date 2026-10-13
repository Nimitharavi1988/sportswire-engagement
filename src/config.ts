// Allow-list. Only Pages listed here are ever touched (read or written). Add a Page by adding an entry
// here (nothing else in the repo changes). 2026-10-13: every Page, at the owner's request; before that only
// Cricket Live and US Sports were in the pilot, and Greenfield was the read-only control.
export interface PilotPage { key: string; label: string; pageId: string; instagramId?: string }

export const PILOT_PAGES: PilotPage[] = [
  { key: "cricketlive", label: "Sportswirecricketlive", pageId: "1389324964254541", instagramId: "17841422405517404" },
  { key: "us", label: "SportsWire US Live", pageId: "1456000910921996", instagramId: "17841424699143294" },
  { key: "main", label: "Sports Wire Live (main)", pageId: "1287339801134616", instagramId: "17841426520820898" },
  { key: "india-cricket", label: "Greenfield", pageId: "359420874511841" },
  { key: "football", label: "SportsWire Football Live", pageId: "1344971308703586", instagramId: "17841462310314966" },
  { key: "fight", label: "SportsWire Fight Live", pageId: "1423517120834814" },
  { key: "es", label: "Sports Wire Live in Spanish", pageId: "1343775455488735", instagramId: "17841471180978125" },
];

// Read-only reference Pages for comparison in the dashboard. No writes, ever. None now: Greenfield moved into the
// list above, so there is no untouched Page left to compare against (the 30% holdout of each Page's posts is the control).
export const CONTROL_PAGES: PilotPage[] = [];

export const GRAPH = "https://graph.facebook.com/v20.0";
export const LIVE = process.env.ENGAGEMENT_LIVE === "1";
