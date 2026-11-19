import { redirect } from "next/navigation";

export default function OrdersRoute() {
  redirect("/portfolio?view=orders");
}
