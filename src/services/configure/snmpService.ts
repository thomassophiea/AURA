/** SNMP settings (`/v1/snmp`, singleton GET/PUT — new resource, absent from api.ts). */
import { createSingletonClient } from './resourceClient';
import type { SnmpSettings } from '../../types/configure';

export const snmpService = createSingletonClient<SnmpSettings>({
  resource: 'snmp',
  path: '/v1/snmp',
});
