import { redirect } from "next/navigation";

export default function NotificationSettingsRoute() { redirect("/settings?tab=notifications"); }
