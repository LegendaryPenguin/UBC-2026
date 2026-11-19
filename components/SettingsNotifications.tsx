import { Card } from "@/components/ui";

export function SettingsNotifications({ embedded = false }: { embedded?: boolean }) {
  return (
    <div className="space-y-4">
      {!embedded ? <h1 className="font-serif text-3xl">Notification preferences</h1> : null}
      <Card>
        <p className="text-sm">In-app is baseline. Security messages cannot be treated as marketing. Quiet hours apply to optional research alerts.</p>
      </Card>
    </div>
  );
}
