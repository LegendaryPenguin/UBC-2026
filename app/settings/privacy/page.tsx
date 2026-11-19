import { redirect } from "next/navigation";

export default function PrivacySettingsRoute() { redirect("/settings?tab=privacy"); }
