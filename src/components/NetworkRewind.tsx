import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Badge } from './ui/badge';
import { Clock, Play, Pause, RotateCcw, Calendar, History } from 'lucide-react';
import { metricsStorage } from '../services/metricsStorage';
import { toast } from 'sonner';

interface NetworkRewindProps {
  serviceId?: string;
  onTimeChange: (timestamp: Date | null) => void;
  isLive: boolean;
  onLiveToggle: () => void;
}

export function NetworkRewind({ serviceId, onTimeChange, isLive, onLiveToggle }: NetworkRewindProps) {
  const [availableRange, setAvailableRange] = useState<{ earliest: Date | null; latest: Date | null }>({
    earliest: null,
    latest: null
  });
  const [selectedTime, setSelectedTime] = useState<Date>(new Date());
  const [sliderValue, setSliderValue] = useState<number>(100);
  const [isLoading, setIsLoading] = useState(true);
  const [dataAvailable, setDataAvailable] = useState(false);

  // Load available time range on mount
  useEffect(() => {
    loadAvailableRange();
  }, [serviceId]);

  const loadAvailableRange = async () => {
    setIsLoading(true);
    try {
      const range = await metricsStorage.getAvailableTimeRange(serviceId);

      if (range.earliest && range.latest) {
        setAvailableRange(range);
        setSelectedTime(range.latest); // Start at latest time
        setDataAvailable(true);
        console.log('[NetworkRewind] Available range:', range);
      } else {
        setDataAvailable(false);
        console.log('[NetworkRewind] No historical data available yet');
        toast.info('No historical data available', {
          description: 'Historical data will be collected starting now. Check back in 15 minutes.'
        });
      }
    } catch (error) {
      console.error('[NetworkRewind] Error loading time range:', error);
      setDataAvailable(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Update selected time when slider changes
  useEffect(() => {
    if (!availableRange.earliest || !availableRange.latest) return;

    const totalMs = availableRange.latest.getTime() - availableRange.earliest.getTime();
    const offsetMs = (totalMs * sliderValue) / 100;
    const newTime = new Date(availableRange.earliest.getTime() + offsetMs);

    setSelectedTime(newTime);

    // Only notify parent if not in live mode
    if (!isLive) {
      onTimeChange(newTime);
    }
  }, [sliderValue, availableRange, isLive]);

  // Reset to live when toggling live mode
  useEffect(() => {
    if (isLive) {
      onTimeChange(null); // null = live data
      if (availableRange.latest) {
        setSelectedTime(availableRange.latest);
        setSliderValue(100);
      }
    }
  }, [isLive]);

  const handleSliderChange = (value: number[]) => {
    if (isLive) {
      // Switch to historical mode when user moves slider
      onLiveToggle();
    }
    setSliderValue(value[0]);
  };

  const handleResetToLive = () => {
    setSliderValue(100);
    if (!isLive) {
      onLiveToggle(); // Switch to live mode
    }
  };

  const formatDate = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatRangeInfo = (): string => {
    if (!availableRange.earliest || !availableRange.latest) return 'No data';

    const diffMs = availableRange.latest.getTime() - availableRange.earliest.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    const diffHours = Math.floor((diffMs % 86400000) / 3600000);

    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''}${diffHours > 0 ? ` ${diffHours}h` : ''}`;
    }
    return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
  };

  if (isLoading) {
    return (
      <Card className="surface-1dp">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <History className="h-5 w-5 text-primary animate-pulse" />
              <CardTitle className="text-lg">Network Rewind</CardTitle>
            </div>
            <Badge variant="outline">Loading...</Badge>
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (!dataAvailable) {
    return (
      <Card className="surface-1dp">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <History className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Network Rewind</CardTitle>
            </div>
            <Badge variant="outline">No Data</Badge>
          </div>
          <CardDescription className="pt-2">
            Historical data collection will begin automatically. Check back in 15-30 minutes to see past metrics.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="surface-1dp">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <History className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Network Rewind</CardTitle>
          </div>
          <div className="flex items-center space-x-2">
            {isLive ? (
              <Badge className="bg-green-600 hover:bg-green-700">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse mr-2"></span>
                LIVE
              </Badge>
            ) : (
              <Badge variant="secondary">
                <Clock className="h-3 w-3 mr-1" />
                Historical
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          View metrics from the past {formatRangeInfo()}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Time Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(selectedTime)}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {selectedTime.toLocaleString()}
            </span>
          </div>

          <Slider
            value={[sliderValue]}
            onValueChange={handleSliderChange}
            min={0}
            max={100}
            step={1}
            className="w-full"
            disabled={!dataAvailable}
          />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {availableRange.earliest?.toLocaleDateString()}
            </span>
            <span>
              {availableRange.latest?.toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center space-x-2">
          <Button
            variant={isLive ? "default" : "outline"}
            size="sm"
            onClick={handleResetToLive}
            className="flex-1"
          >
            {isLive ? (
              <>
                <Play className="h-4 w-4 mr-2" />
                Live Mode
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4 mr-2" />
                Return to Live
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={loadAvailableRange}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {/* Info */}
        {!isLive && (
          <div className="flex items-start space-x-2 p-3 bg-secondary/10 rounded-lg border border-secondary/20">
            <Clock className="h-4 w-4 text-secondary mt-0.5" />
            <div className="flex-1 text-xs text-secondary">
              <p className="font-medium">Viewing historical data</p>
              <p className="text-muted-foreground mt-1">
                Showing metrics from {formatDate(selectedTime)}.
                Return to live mode to see real-time data.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
