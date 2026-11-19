import { redirect } from "next/navigation";

export default function NotificationsRoute() {
  redirect("/portfolio?view=alerts#inbox");
}
