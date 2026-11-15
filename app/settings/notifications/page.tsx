import { Card } from "@/components/ui";

export default function NotificationSettings() {
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Notification preferences</h1>
      <Card>
        <p className="text-sm">In-app is baseline. Security messages cannot be treated as marketing. Quiet hours apply to optional research alerts.</p>
      </Card>
    </div>
  );
}
