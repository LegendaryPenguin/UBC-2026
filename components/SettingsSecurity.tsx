import { Card } from "@/components/ui";

export function SettingsSecurity({ embedded = false }: { embedded?: boolean }) {
  return (
    <div className="space-y-4">
      {!embedded ? <h1 className="font-serif text-3xl">Security</h1> : null}
      <Card>
        <p className="text-sm">Passkeys and wallet sign-in are separate. Restoring this app account does not restore a lost external wallet key. The last usable auth method cannot be removed without a replacement.</p>
      </Card>
    </div>
  );
}
