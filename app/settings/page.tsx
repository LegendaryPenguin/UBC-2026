import { Button, Card } from "@/components/ui";

export default function Settings() {
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Settings</h1>
      <div className="grid gap-3 md:grid-cols-2">
        {[
          ["/settings/account", "Account"],
          ["/settings/security", "Security"],
          ["/settings/connections", "Connections"],
          ["/settings/notifications", "Notifications"],
          ["/settings/privacy", "Privacy"],
        ].map(([href, label]) => (
          <Card key={href}>
            <Button href={href} kind="ghost">{label}</Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
