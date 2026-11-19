import { redirect } from "next/navigation";

export default function ConnectionsSettingsRoute() { redirect("/settings?tab=connections"); }
