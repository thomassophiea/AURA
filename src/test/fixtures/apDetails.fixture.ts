/**
 * Live capture from Extreme Campus Controller XCC 10.18.1.0-011R.
 * AP5020-PVT-03_MESH_ROOT (CV012408S-C0078), GET /v1/aps/{serial} power-related config.
 *
 * Captured 2026-08-05. Three radios up at 20/40/80 MHz; usb/pse/iot already off, LED NORMAL,
 * autoTxPowerMin on, negotiated 802.3bt.
 */
import type { APDetails } from '../../types/api';

export const AP5020_DETAILS: APDetails = {
  "serialNumber": "CV012408S-C0078",
  "apName": "AP5020-PVT-03_MESH_ROOT",
  "hardwareType": "AP5020-WW",
  "usbPower": "Off",
  "psePower": "Off",
  "iotEnabled": false,
  "ledStatus": "NORMAL",
  "autoTxPowerMin": true,
  "forcePoEPlus": false,
  "pwrSource": "Bt",
  "ethPowerStatus": "normal",
  "ethPorts": [
    {
      "name": "eth0",
      "speed": "speed5Gbps",
      "mode": "fullDuplex",
      "power": "Bt"
    },
    {
      "name": "eth1",
      "speed": "speedNA",
      "mode": "NA",
      "power": "None"
    }
  ],
  "radios": [
    {
      "radioIndex": 1,
      "mode": "gnxbe",
      "channelwidth": "Ch1Width_20MHz",
      "adminState": true,
      "useSmartRf": false,
      "txMaxPower": 18,
      "txPower": 18,
      "opChannel": "11",
      "pwrMode6": "LPI",
      "afc": false
    },
    {
      "radioIndex": 2,
      "mode": "ancxbe",
      "channelwidth": "Ch1Width_40MHz",
      "adminState": true,
      "useSmartRf": false,
      "txMaxPower": 18,
      "txPower": 18,
      "opChannel": "149/40",
      "pwrMode6": "LPI",
      "afc": false
    },
    {
      "radioIndex": 3,
      "mode": "ax6be",
      "channelwidth": "Ch1Width_80MHz",
      "adminState": true,
      "useSmartRf": false,
      "txMaxPower": 12,
      "txPower": 12,
      "opChannel": "7e/80",
      "pwrMode6": "LPI",
      "afc": false
    }
  ]
} as unknown as APDetails;
