import { DevEpicBadge } from './DevEpicBadge';

export function ConfigureRRM() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-semibold text-foreground">RF Management</h1>
        <DevEpicBadge
          epicKey="NVO-7299"
          epicTitle="Wireless RRM Configuration"
          jiraUrl="https://extremenetworks.atlassian.net/browse/NVO-7299"
        />
      </div>
      <p className="text-muted-foreground">RF Management profile configuration coming soon.</p>
    </div>
  );
}
