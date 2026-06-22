"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";

// JXL is paused — redirect any direct navigation back to intake.
// The full chat UI below is preserved but unreachable while paused,
// so re-enabling later is a one-line revert.
export default function JxlScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/reading/intake");
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#050816]">
      <div className="h-2 w-2 animate-pulse rounded-full bg-amber-300" />
    </div>
  );
}