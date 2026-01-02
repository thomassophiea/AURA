# Widget Implementation Mapping

## API Endpoints

### Deployment-Level Reports
- **Endpoint**: `/management/v1/report/sites`
- **Parameters**: `duration`, `resolution`, `widgetList`
- **Scope**: All sites across deployment

### Site-Level Reports
- **Endpoint**: `/management/v1/report/sites/{siteId}`
- **Parameters**: `duration`, `resolution`, `widgetList`
- **Scope**: Single site

### Venue Reports
- **Endpoint**: `/management/v3/sites/{siteId}/report/venue`
- **Parameters**: `duration`, `resolution`, `statType`, `userGroups`, `widgetList`
- **Scope**: Venue-specific user group analytics

### System Information
- **Endpoint**: `/platformmanager/v1/reports/systeminformation`
- **Scope**: System health and status

## Available Widgets (75+ total)

### 1. Throughput and Usage (9 widgets)
- ✅ `throughputReport` - Total/Upload/Download throughput timeseries
- ✅ `byteUtilization` - Byte usage metrics
- ✅ `ulDlThroughputTimeseries` - UL/DL throughput over time
- ✅ `ulDlUsageTimeseries` - UL/DL usage over time
- ✅ `ulThroughputPeakScorecard` - Upload peak throughput
- ✅ `dlThroughputPeakScorecard` - Download peak throughput
- ✅ `ulUsageScorecard` - Upload usage total
- ✅ `dlUsageScorecard` - Download usage total
- ✅ `throughputPerUserGroup` - Throughput by user group

### 2. Client Metrics (13 widgets)
- ✅ `countOfUniqueUsersReport` - Unique client count timeseries
- ✅ `clientDistributionByRFProtocol` - Clients by WiFi protocol (a/b/g/n/ac/ax)
- ✅ `topManufacturersByClientCount` - Top device manufacturers
- ✅ `worstManufacturersByClientCount` - Bottom manufacturers
- ✅ `topOsByClientCountReport` - Top operating systems
- ✅ `worstOsByClientCountReport` - Bottom operating systems
- ✅ `topClientsByUsage` - Top clients by data usage
- ✅ `topClientsByRetries` - Top clients by retry rate
- ✅ `worstClientsByRetries` - Bottom clients by retries
- ✅ `topClientsBySnr` - Top clients by signal-to-noise ratio
- ✅ `worstClientsBySnr` - Bottom clients by SNR
- ✅ `uniqueClientsPeakScorecard` - Peak concurrent clients
- ✅ `uniqueClientsTotalScorecard` - Total unique clients
- ✅ `clientTimeseriesPerUserGroup` - Client count by user group over time
- ✅ `concurrentClientTimeseriesPerUserGroup` - Concurrent clients by group
- ✅ `ulUsageByUserGroup` - Upload usage by user group
- ✅ `dlUsageByUserGroup` - Download usage by user group

### 3. Site Analytics (6 widgets)
- ✅ `topSitesByThroughput` - Top sites by throughput
- ✅ `topSitesByClientCount` - Top sites by client count
- ✅ `topSitesByChannelUtil` - Top sites by channel utilization (2.4GHz)
- ✅ `topSitesBySnr` - Top sites by SNR
- ✅ `topSitesByChannelChanges` - Sites with most channel changes
- ✅ `topSitesByPowerChanges` - Sites with most power changes

### 4. Access Point Analytics (12 widgets)
- ✅ `topAccessPointsByThroughput` - Top APs by throughput
- ✅ `topAccessPointsByUserCount` - Top APs by user count
- ✅ `topAccessPointsByConcurrentUserCount` - Top APs by concurrent users
- ✅ `topAccessPointsByRfHealth` - Top APs by RF health score
- ✅ `topApsByChannelUtil` - Top APs by channel utilization
- ✅ `worstApsByChannelUtil` - Bottom APs by channel utilization
- ✅ `topApsBySnr` - Top APs by SNR
- ✅ `worstApsBySnr` - Bottom APs by SNR
- ✅ `topApsByRetries` - Top APs by retry rate
- ✅ `worstApsByRetries` - Bottom APs by retries
- ✅ `topApsByChannelChanges` - APs with most channel changes
- ✅ `topApsByPowerChanges` - APs with most power changes
- ✅ `worstApsByRfHealth` - Bottom APs by RF health

### 5. RF and Radio Analytics (5 widgets)
- ✅ `rfQuality` - Overall RF quality metrics
- ✅ `channelDistributionRadio1` - 2.4GHz channel distribution
- ✅ `channelDistributionRadio2` - 5GHz channel distribution
- ✅ `channelDistributionRadio3` - 6GHz channel distribution

### 6. Application Analytics (12 widgets)
- ✅ `topAppGroupsByUsage` - Top application groups by data usage
- ✅ `topAppGroupsByClientCountReport` - Top app groups by client count
- ✅ `topAppGroupsByThroughputReport` - Top app groups by throughput
- ✅ `worstAppGroupsByUsage` - Bottom app groups by usage
- ✅ `worstAppGroupsByClientCountReport` - Bottom app groups by clients
- ✅ `worstAppGroupsByThroughputReport` - Bottom app groups by throughput
- ✅ `topServicesByThroughput` - Top services by throughput
- ✅ `topServicesByClientCount` - Top services by client count
- ✅ `worstServicesByClientCount` - Bottom services by clients

### 7. Guest and Location Analytics (6 widgets)
- ✅ `dwellTimeReport` - Client dwell time analytics
- ✅ `guestUsersReport` - Guest user metrics
- ✅ `topAreaByVisitors` - Top areas by visitor count
- ✅ `worstAreaByVisitors` - Bottom areas by visitors
- ✅ `topFloorByVisitors` - Top floors by visitor count
- ✅ `worstFloorByVisitors` - Bottom floors by visitors

### 8. System Health (7 widgets)
- ✅ `systemHealth` - Overall system health status
- ✅ `networkHealth` - Network health (active/inactive APs/switches)
- ✅ `deploymentQoE` - Deployment-wide Quality of Experience
- ✅ `siteQoE` - Site-specific Quality of Experience
- ✅ `dataPortCongestionEvent` - Data port congestion event count
- ✅ `dataPortCongestionDuration` - Data port congestion duration
- ✅ `packetCaptureList` - Packet capture sessions
- ✅ `pollSitesStats` - Site polling statistics

### 9. Users (2 widgets)
- ✅ `topUsersByThroughput` - Top users by throughput
- ✅ `worstUsersByThroughput` - Bottom users by throughput

## Widget Types
Based on API responses:
- **Timeseries**: Line/area charts with time-based data points
- **Top/Worst**: Bar charts or tables ranking items
- **Scorecard**: Single-value metric displays
- **Distribution**: Pie charts or bar charts showing breakdowns
- **Health**: Status indicators with counts/percentages

## Implementation Plan

### Phase 1: Core Infrastructure
1. Create API service layer for fetching widget data
2. Build reusable widget components:
   - TimeseriesChart (for throughput, users, etc.)
   - TopBottomTable (for top/worst rankings)
   - ScoreCard (for single metrics)
   - DistributionChart (for protocol/manufacturer/OS breakdowns)
   - HealthIndicator (for system/network health)

### Phase 2: Network Insights Page
Organize widgets by category tabs:
- **Overview**: Throughput, clients, QoE
- **Sites**: Site analytics and rankings
- **Access Points**: AP performance and rankings
- **Clients**: Client distribution and top/worst
- **RF Analytics**: Channel distribution, RF quality
- **Applications**: App group and service analytics
- **Locations**: Venue, area, floor analytics
- **Health**: System and network health

### Phase 3: Report Widgets Page
Reuse Network Insights components but with:
- Customizable widget selection
- Drag-and-drop layout
- Export capabilities
- Custom time ranges per widget
