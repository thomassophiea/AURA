import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Badge } from './ui/badge';
import { Clock, RotateCcw, History } from 'lucide-react';
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

  useEffect(() => {
    loadAvailableRange();
  }, [serviceId]);

  const loadAvailableRange = async () => {
    setIsLoading(true);
    const range = await metricsStorage.getAvailableTimeRange(serviceId);

    if (range.earliest && range.latest) {
      setAvailableRange(range);
      setSelectedTime(range.latest);
      setDataAvailable(true);
    } else {
      setDataAvailable(false);
      toast.info('No historical data yet', {
        description: 'Data will be collected every 15 minutes'
      });
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (!availableRange.earliest || !availableRange.latest) return;

    const totalMs = availableRange.latest.getTime() - availableRange.earliest.getTime();
    const offsetMs = (totalMs * sliderValue) / 100;
    const newTime = new Date(availableRange.earliest.getTime() + offsetMs);

    setSelectedTime(newTime);
    if (!isLive) onTimeChange(newTime);
  }, [sliderValue, availableRange, isLive]);

  useEffect(() => {
    if (isLive) {
      onTimeChange(null);
      if (availableRange.latest) {
        setSelectedTime(availableRange.latest);
        setSliderValue(100);
      }
    }
  }, [isLive]);

  const handleSliderChange = (value: number[]) => {
    if (isLive) onLiveToggle();
    setSliderValue(value[0]);
  };

  const formatDate = (date: Date): string => {
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading) {
    return (
      <Card className="surface-1dp">
        <CardHeader className="pb-3">
          <div className="flex items-center space-x-2">
            <History className="h-5 w-5 animate-pulse" />
            <CardTitle className="text-lg">Network Rewind</CardTitle>
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
              <History className="h-5 w-5" />
              <CardTitle className="text-lg">Network Rewind</CardTitle>
            </div>
            <Badge variant="outline">No Data</Badge>
          </div>
          <CardDescription>
            Historical data collection will begin automatically. Check back in 15-30 minutes.
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
          {isLive ? (
            <Badge className="bg-green-600">
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
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{formatDate(selectedTime)}</span>
            <span className="text-xs text-muted-foreground">{selectedTime.toLocaleString()}</span>
          </div>

          <Slider
            value={[sliderValue]}
            onValueChange={handleSliderChange}
            min={0}
            max={100}
            step={1}
            className="w-full"
          />

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{availableRange.earliest?.toLocaleDateString()}</span>
            <span>{availableRange.latest?.toLocaleDateString()}</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant={isLive ? "default" : "outline"}
            size="sm"
            onClick={() => { setSliderValue(100); if (!isLive) onLiveToggle(); }}
            className="flex-1"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {isLive ? 'Live Mode' : 'Return to Live'}
          </Button>
          <Button variant="outline" size="sm" onClick={loadAvailableRange}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {!isLive && (
          <div className="p-3 bg-secondary/10 rounded-lg border border-secondary/20 text-xs">
            <p className="font-medium text-secondary">Viewing historical data</p>
            <p className="text-muted-foreground mt-1">
              Showing metrics from {formatDate(selectedTime)}. Return to live mode for real-time data.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
