/**
 * Heavy Analytics Panel - Lazy Loaded on Mobile
 *
 * This component is loaded asynchronously on mobile devices
 * to improve initial load performance
 */

export default function HeavyAnalyticsPanel() {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-muted rounded-lg">
        <h3 className="font-semibold mb-2">Performance Metrics</h3>
        <p className="text-sm text-muted-foreground">
          Detailed performance analytics and insights
        </p>
      </div>

      <div className="p-4 bg-muted rounded-lg">
        <h3 className="font-semibold mb-2">Traffic Analysis</h3>
        <p className="text-sm text-muted-foreground">
          Deep dive into network traffic patterns
        </p>
      </div>

      <div className="p-4 bg-muted rounded-lg">
        <h3 className="font-semibold mb-2">Client Behavior</h3>
        <p className="text-sm text-muted-foreground">
          Historical client connection data and trends
        </p>
      </div>
    </div>
  );
}
