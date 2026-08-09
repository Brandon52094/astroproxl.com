import { Suspense } from "react";
import ChartDataScreen from "../components/ChartDataScreen";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh" }} />}>
      <ChartDataScreen />
    </Suspense>
  );
}