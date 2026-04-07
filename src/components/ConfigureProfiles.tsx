import React from 'react';
import { DevEpicBadge } from './DevEpicBadge';

export default function ConfigureProfiles() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Device Profiles</h1>
        <DevEpicBadge
          epicKey="NVO-9702"
          epicTitle="Wireless Profile Configuration"
          jiraUrl="https://extremenetworks.atlassian.net/browse/NVO-9702"
        />
      </div>
      <p className="text-muted-foreground">Device profile management coming soon.</p>
    </div>
  );
}
