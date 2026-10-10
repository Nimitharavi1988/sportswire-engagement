// Pilot allow-list. Only Pages listed here are ever touched. Greenfield and the main Page are
// deliberately absent. Add a Page by adding an entry here (nothing else in the repo changes).
export interface PilotPage { key: string; label: string; pageId: string; instagramId?: string }

export const PILOT_PAGES: PilotPage[] = [
  { key: "cricketlive", label: "Sportswirecricketlive", pageId: "1389324964254541", instagramId: "17841422405517404" },
  { key: "us", label: "SportsWire US Live", pageId: "1456000910921996", instagramId: "17841424699143294" },
];

// Read-only reference Pages for comparison in the dashboard. No writes, ever.
export const CONTROL_PAGES: PilotPage[] = [
  { key: "india-cricket", label: "Greenfield (control)", pageId: "359420874511841" },
];

export const GRAPH = "https://graph.facebook.com/v20.0";
export const LIVE = process.env.ENGAGEMENT_LIVE === "1";
