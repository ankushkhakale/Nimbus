"use client";

import React from "react";

import { FileBrowser } from "@/components/dashboard/FileBrowser";
import { UserMenu } from "@/components/UserMenu";

export default function DashboardPage() {
  return (
    <>
      {/* Sits above the browser's own header row. */}
      <div style={{ position: "fixed", top: "16px", right: "40px", zIndex: 60 }}>
        <UserMenu />
      </div>
      <FileBrowser />
    </>
  );
}
