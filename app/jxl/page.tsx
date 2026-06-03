import { Suspense } from "react";
import JxlScreen from "@/components/JxlScreen"; // Adjust this path if your component location differs

export default function JxlPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black text-amber-500 flex items-center justify-center">Loading cosmic matrix...</div>}>
      <JxlScreen />
    </Suspense>
  );
}