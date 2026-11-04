import { PulseExperience } from "@/components/PulseExperience";
import { ReleaseTally } from "@/components/ReleaseTally";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <PulseExperience>
      <ReleaseTally />
    </PulseExperience>
  );
}
