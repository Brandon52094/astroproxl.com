import { Suspense } from "react";
//  Fixed path to point directly to your app directory location
import JxlScreen from "@/app/components/JxlScreen"; 

export default function JxlPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black text-amber-500 flex items-center justify-center">Loading cosmic matrix...</div>}>
      <JxlScreen />
    </Suspense>
  );
}