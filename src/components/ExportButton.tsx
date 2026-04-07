import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Download, FileText, FileJson, Printer } from 'lucide-react';
import { exportToCSV, exportToJSON, printReport } from '../utils/exportUtils';
import { toast } from 'sonner';

interface ExportButtonProps<T extends Record<string, any>> {
  data: T[];
  columns: { key: keyof T; label: string }[];
  filename: string;
  title?: string;
}

export function ExportButton<T extends Record<string, any>>({
  data,
  columns,
  filename,
  title,
}: ExportButtonProps<T>) {
  const handleExport = (format: 'csv' | 'json' | 'print') => {
    if (data.length === 0) {
      toast.error('No data to export');
      return;
    }

    switch (format) {
      case 'csv':
        exportToCSV(data, columns, filename);
        toast.success('CSV exported');
        break;
      case 'json':
        exportToJSON(data, filename);
        toast.success('JSON exported');
        break;
      case 'print':
        printReport(data, columns, title || filename);
        break;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => handleExport('csv')}>
          <FileText className="h-4 w-4 mr-2" />
          Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('json')}>
          <FileJson className="h-4 w-4 mr-2" />
          Export JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('print')}>
          <Printer className="h-4 w-4 mr-2" />
          Print Report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
