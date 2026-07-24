"use client";

import { FileBrowser } from "@/components/dashboard/FileBrowser";

export default function DashboardPage() {
  // The user menu now lives inside the browser's toolbar (see Toolbar in
  // FileBrowser), so it flows with the header instead of a fixed overlay
  // that overlapped the toolbar controls on narrow screens.
  return <FileBrowser />;
}
