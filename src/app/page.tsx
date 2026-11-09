import { Suspense } from "react";
import { GlobeApp } from "@/components/home/globe-app";

export default function Home() {
  return (
    <Suspense>
      <GlobeApp />
    </Suspense>
  );
}
