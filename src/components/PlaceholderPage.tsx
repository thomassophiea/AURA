import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Construction, Info } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Construction className="h-5 w-5" />
            <span>Coming Soon</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            This section will be implemented as we add functionality piece by piece. 
            For now, you can use the API Test Tool to explore the available endpoints 
            and test the Campus Controller API.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}