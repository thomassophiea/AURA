import { describe, it, expect } from 'vitest';
import { CONFIGURATION_DOMAINS, detectConfigurationDomain } from './configurationDomainCatalog.js';

describe('CONFIGURATION_DOMAINS', () => {
  it('covers all 30 non-WLAN skills from the Ascend IQC Skills Catalog audit', () => {
    expect(CONFIGURATION_DOMAINS).toHaveLength(30);
  });

  it('every domain has a real, non-empty localApi reference and AURA cross-reference', () => {
    for (const d of CONFIGURATION_DOMAINS) {
      expect(d.localApi.length).toBeGreaterThan(0);
      expect(d.auraSupport.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate domain ids or skill numbers', () => {
    const ids = CONFIGURATION_DOMAINS.map((d) => d.id);
    const nums = CONFIGURATION_DOMAINS.map((d) => d.skillNumber);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(nums).size).toBe(nums.length);
  });
});

describe('detectConfigurationDomain', () => {
  const POSITIVE_CASES = [
    ['create a new vlan for guest access', 'vlan'],
    ['create a new VLAN 40 for IoT', 'vlan'],
    ['add a vlan group for load balancing', 'vlan_group'],
    ['configure the AAA policy with a RADIUS server', 'aaa_policy'],
    ['define client traffic enforcement rules for the Role', 'role'],
    ['set up PPSK for this network', 'ppsk'],
    ['configure the captive portal branding', 'captive_portal'],
    ['create a class of service profile', 'cos'],
    ['add a rate limiter policy', 'rate_limiter'],
    ['create a wireless profile for the new APs', 'profile'],
    ['set the radio operational mode in the profile', 'radio'],
    ['configure RRM sensitivity', 'rrm'],
    ['set eth0 speed and duplex on the wired port', 'wired_port'],
    ['enable air defense WIDS', 'air_defense'],
    ['configure positioning profiles collection mode', 'positioning'],
    ['set up analytics profile with netflow', 'analytics'],
    ['configure RTLS with aeroscout', 'rtls'],
    ['set up iot profile ble beacon', 'iot_profile'],
    ['configure ESL profile for retail', 'esl'],
    ['create a meshpoint for backhaul', 'meshpoint'],
    ['show me the ap device list', 'ap_device'],
    ['configure adoption rules for new APs', 'ap_adoption_rules'],
    ['set up NTP on the controller system', 'controller_system'],
    ['add a MAC ACL entry', 'mac_acl'],
    ['create an administrator account', 'administrator'],
    ['issue a new application key', 'app_key'],
    ['update the DPI application signature list', 'dpi_signatures'],
    ['configure xlocation profile', 'xlocation'],
    ['set up nsight integration', 'nsight'],
    ['configure global site defaults', 'global_site_defaults'],
    ['create a report template', 'report_template'],
  ];

  it.each(POSITIVE_CASES)('recognizes %s as domain %s', (input, expectedId) => {
    expect(detectConfigurationDomain(input)?.id).toBe(expectedId);
  });

  it('does not misclassify a real WLAN creation request into a non-WLAN domain', () => {
    expect(detectConfigurationDomain('create a guest wlan at boston office wpa2 password guestwifi1')).toBeNull();
  });

  it('does not misclassify a WLAN sentence that happens to mention an existing VLAN by number', () => {
    expect(detectConfigurationDomain('create a guest wlan on vlan 40')).toBeNull();
  });

  it('does not misclassify a plain read-only WLAN question', () => {
    expect(detectConfigurationDomain('what wlans are configured at boston office')).toBeNull();
  });

  it('returns null for text matching no known domain', () => {
    expect(detectConfigurationDomain('what is the weather today')).toBeNull();
  });
});
