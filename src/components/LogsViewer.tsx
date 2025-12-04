import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Skeleton } from './ui/skeleton';
import {
  FileText,
  Download,
  RefreshCw,
  Search,
  Filter,
  AlertCircle,
  Info,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Play,
  Pause
} from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  category: string;
  source: string;
  message: string;
  details?: string;
}

export function LogsViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [logsPerPage] = useState(50);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const categories = [
    'all',
    'system',
    'application',
    'security',
    'network',
    'authentication',
    'authorization',
    'device',
    'client',
    'configuration'
  ];

  const levels = ['all', 'debug', 'info', 'warning', 'error', 'critical'];

  useEffect(() => {
    loadLogs();
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(() => {
        loadLogs(true);
      }, 5000);
    } else {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    }
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh]);

  useEffect(() => {
    filterLogs();
  }, [logs, searchTerm, selectedLevel, selectedCategory]);

  const loadLogs = async (silent = false) => {
    if (!silent) setLoading(true);

    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (selectedLevel !== 'all') {
        params.append('level', selectedLevel);
      }
      if (selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }
      params.append('limit', '200');

      const response = await apiService.makeAuthenticatedRequest(
        `/v1/logs${params.toString() ? '?' + params.toString() : ''}`,
        { method: 'GET' }
      );

      if (response.ok) {
        const data = await response.json();
        setLogs(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
      toast.error('Failed to load logs');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const filterLogs = () => {
    let filtered = [...logs];

    // Filter by level
    if (selectedLevel !== 'all') {
      filtered = filtered.filter(log => log.level === selectedLevel);
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(log => log.category === selectedCategory);
    }

    // Filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(search) ||
        log.source.toLowerCase().includes(search) ||
        log.category.toLowerCase().includes(search)
      );
    }

    setFilteredLogs(filtered);
    setCurrentPage(1);
  };

  const handleExportLogs = () => {
    try {
      const logText = filteredLogs.map(log =>
        `[${new Date(log.timestamp).toLocaleString()}] [${log.level.toUpperCase()}] [${log.category}] [${log.source}] ${log.message}${log.details ? '\n  Details: ' + log.details : ''}`
      ).join('\n');

      const blob = new Blob([logText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs-${new Date().toISOString()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Logs exported successfully');
    } catch (error) {
      toast.error('Failed to export logs');
    }
  };

  const getLevelIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'debug':
        return <Info className="h-4 w-4 text-gray-500" />;
      case 'info':
        return <CheckCircle className="h-4 w-4 text-blue-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'critical':
        return <AlertCircle className="h-4 w-4 text-red-700" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getLevelBadge = (level: LogEntry['level']) => {
    const variants: Record<LogEntry['level'], string> = {
      debug: 'bg-gray-500',
      info: 'bg-blue-500',
      warning: 'bg-yellow-500',
      error: 'bg-red-500',
      critical: 'bg-red-700'
    };

    return (
      <Badge className={variants[level]}>
        {level.toUpperCase()}
      </Badge>
    );
  };

  const indexOfLastLog = currentPage * logsPerPage;
  const indexOfFirstLog = indexOfLastLog - logsPerPage;
  const currentLogs = filteredLogs.slice(indexOfFirstLog, indexOfLastLog);
  const totalPages = Math.ceil(filteredLogs.length / logsPerPage);

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" />
          System Logs
        </h2>
        <p className="text-muted-foreground">
          View and analyze system logs in real-time
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Log Filters</CardTitle>
          <CardDescription>Filter and search through system logs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {/* Level Filter */}
            <div className="space-y-2">
              <Label>Level</Label>
              <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {levels.map(level => (
                    <SelectItem key={level} value={level}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category Filter */}
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(category => (
                    <SelectItem key={category} value={category}>
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Auto Refresh */}
            <div className="space-y-2">
              <Label>Auto Refresh (5s)</Label>
              <div className="flex items-center gap-2 h-10">
                <Switch
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                />
                {autoRefresh ? (
                  <Play className="h-4 w-4 text-green-500" />
                ) : (
                  <Pause className="h-4 w-4 text-gray-500" />
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              Showing {indexOfFirstLog + 1}-{Math.min(indexOfLastLog, filteredLogs.length)} of {filteredLogs.length} logs
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => loadLogs()}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportLogs}>
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Log Entries</CardTitle>
          <CardDescription>Real-time system log stream</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {currentLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No logs found matching the current filters
              </div>
            ) : (
              currentLogs.map(log => (
                <div
                  key={log.id}
                  className="border rounded-lg p-3 hover:bg-accent transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-0.5">{getLevelIcon(log.level)}</div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground font-mono">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                          {getLevelBadge(log.level)}
                          <Badge variant="outline">{log.category}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {log.source}
                          </span>
                        </div>
                        <p className="text-sm">{log.message}</p>
                        {log.details && (
                          <p className="text-xs text-muted-foreground pl-4 border-l-2">
                            {log.details}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <div className="flex items-center gap-2">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
