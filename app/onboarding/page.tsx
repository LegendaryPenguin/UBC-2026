import { redirect } from "next/navigation";

export default function OnboardingRoute() {
  redirect("/settings?tab=account");
}
