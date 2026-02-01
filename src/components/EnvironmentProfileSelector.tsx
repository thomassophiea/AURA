/**
 * Context Profile Selector
 * 
 * Dropdown to select the context profile that tunes what is considered "abnormal"
 * for RF quality and network metrics.
 */

import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from './ui/dropdown-menu';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { 
  Check, ChevronDown, Settings2, Store, Warehouse, Package, 
  Building2, GraduationCap, Settings, Sparkles, Brain, type LucideIcon 
} from 'lucide-react';
import { cn } from './ui/utils';
import { useOperationalContext } from '../hooks/useOperationalContext';
import { 
  ENVIRONMENT_PROFILES, 
  type EnvironmentProfileType 
} from '../config/environmentProfiles';
import { aiBaselineService, getAIBaselineThresholds } from '../services/aiBaselineService';

// Map icon names to Lucide components
const iconMap: Record<string, LucideIcon> = {
  Sparkles,
  Store,
  Warehouse,
  Package,
  Building2,
  GraduationCap,
  Settings
};

interface EnvironmentProfileSelectorProps {
  className?: string;
  showThresholds?: boolean;
}

export function EnvironmentProfileSelector({ 
  className,
  showThresholds = false
}: EnvironmentProfileSelectorProps) {
  const { ctx, setEnvironmentProfile } = useOperationalContext();
  const [open, setOpen] = useState(false);
  const [aiBaselineSummary, setAiBaselineSummary] = useState<{
    sampleCount: number;
    confidenceLevel: 'none' | 'low' | 'moderate' | 'high';
    confidenceDescription: string;
  } | null>(null);
  
  // Load AI Baseline summary on mount and when menu opens
  useEffect(() => {
    if (open) {
      const summary = aiBaselineService.getSummary();
      setAiBaselineSummary({
        sampleCount: summary.sampleCount,
        confidenceLevel: summary.confidenceLevel,
        confidenceDescription: summary.confidenceDescription
      });
    }
  }, [open]);
  
  const currentProfile = ENVIRONMENT_PROFILES[ctx.environmentProfile.id] || ENVIRONMENT_PROFILES.CAMPUS;
  
  const handleSelect = (profileId: EnvironmentProfileType) => {
    const profile = ENVIRONMENT_PROFILES[profileId];
    if (profile) {
      if (profileId === 'AI_BASELINE') {
        // Use dynamically calculated AI thresholds
        const aiThresholds = getAIBaselineThresholds();
        setEnvironmentProfile({
          id: 'AI_BASELINE',
          rfqiTarget: aiThresholds.rfqiTarget,
          channelUtilizationPct: aiThresholds.channelUtilizationPct,
          noiseFloorDbm: aiThresholds.noiseFloorDbm,
          clientDensity: aiThresholds.clientDensity,
          latencyP95Ms: aiThresholds.latencyP95Ms,
          retryRatePct: aiThresholds.retryRatePct,
        });
      } else {
        // Convert from environmentProfiles.ts format to useOperationalContext format
        setEnvironmentProfile({
          id: profile.id,
          rfqiTarget: profile.thresholds.rfqiTarget,
          channelUtilizationPct: profile.thresholds.channelUtilizationPct,
          noiseFloorDbm: profile.thresholds.noiseFloorDbm,
          clientDensity: profile.thresholds.clientDensity,
          latencyP95Ms: profile.thresholds.latencyP95Ms,
          retryRatePct: profile.thresholds.retryRatePct,
        });
      }
    }
    setOpen(false);
  };
  
  const getConfidenceColor = (level: 'none' | 'low' | 'moderate' | 'high') => {
    switch (level) {
      case 'none': return 'text-muted-foreground';
      case 'low': return 'text-amber-500';
      case 'moderate': return 'text-blue-500';
      case 'high': return 'text-green-500';
    }
  };
  
  const getConfidenceProgress = (level: 'none' | 'low' | 'moderate' | 'high') => {
    switch (level) {
      case 'none': return 0;
      case 'low': return 25;
      case 'moderate': return 60;
      case 'high': return 100;
    }
  };

  const CurrentIcon = iconMap[currentProfile.icon] || Settings;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className={cn("gap-2 h-9", className)}
          title="Context Profile - Tunes what is considered abnormal"
        >
          <CurrentIcon className="h-4 w-4 text-muted-foreground" />
          <span className="hidden sm:inline">{currentProfile.name}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col">
            <span className="font-medium">Context Profile</span>
            <span className="text-xs text-muted-foreground">
              Tunes what is considered abnormal
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {Object.values(ENVIRONMENT_PROFILES).map((profile) => {
          const ProfileIcon = iconMap[profile.icon] || Settings;
          const isAI = profile.id === 'AI_BASELINE';
          return (
            <DropdownMenuItem
              key={profile.id}
              onClick={() => handleSelect(profile.id)}
              className={cn(
                "flex items-start gap-3 py-2 cursor-pointer",
                isAI && "bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-b border-purple-500/20"
              )}
            >
              <ProfileIcon className={cn(
                "h-5 w-5 mt-0.5",
                isAI ? "text-purple-500" : "text-muted-foreground"
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{profile.name}</span>
                  {isAI && (
                    <Badge className="text-[10px] px-1.5 h-4 bg-purple-500/20 text-purple-400 border-purple-500/30">
                      Auto
                    </Badge>
                  )}
                  {ctx.environmentProfile.id === profile.id && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  {profile.description}
                </p>
                {showThresholds && !isAI && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <Badge variant="outline" className="text-[10px] px-1 h-4">
                      RFQI ≥{profile.thresholds.rfqiTarget}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1 h-4">
                      Ch.Util ≤{profile.thresholds.channelUtilizationPct}%
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1 h-4">
                      Retry ≤{profile.thresholds.retryRatePct}%
                    </Badge>
                  </div>
                )}
                {isAI && aiBaselineSummary && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <Brain className="h-3 w-3 text-purple-400" />
                      <span className={getConfidenceColor(aiBaselineSummary.confidenceLevel)}>
                        {aiBaselineSummary.confidenceDescription}
                      </span>
                    </div>
                    <Progress 
                      value={getConfidenceProgress(aiBaselineSummary.confidenceLevel)} 
                      className="h-1.5 bg-purple-500/10"
                    />
                    {showThresholds && aiBaselineSummary.sampleCount > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge variant="outline" className="text-[10px] px-1 h-4 border-purple-500/30 text-purple-400">
                          RFQI ≥{ctx.environmentProfile.rfqiTarget}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] px-1 h-4 border-purple-500/30 text-purple-400">
                          Ch.Util ≤{ctx.environmentProfile.channelUtilizationPct}%
                        </Badge>
                      </div>
                    )}
                  </div>
                )}
                {isAI && !aiBaselineSummary && (
                  <div className="flex items-center gap-1 mt-1.5 text-[10px] text-purple-400">
                    <Sparkles className="h-3 w-3" />
                    <span>Thresholds adapt to your network</span>
                  </div>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}
        
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-muted-foreground gap-2">
          <Settings2 className="h-4 w-4" />
          <span className="text-sm">Customize thresholds...</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Compact badge showing current profile
 */
export function EnvironmentProfileBadge({ className }: { className?: string }) {
  const { ctx } = useOperationalContext();
  const profile = ENVIRONMENT_PROFILES[ctx.environmentProfile.id] || ENVIRONMENT_PROFILES.CAMPUS;
  const ProfileIcon = iconMap[profile.icon] || Settings;
  
  return (
    <Badge variant="outline" className={cn("gap-1.5", className)}>
      <ProfileIcon className="h-3 w-3" />
      <span>{profile.name}</span>
    </Badge>
  );
}
