import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Loader2 } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import extremeNetworksLogo from 'figma:asset/f6780e138108fdbc214f37376d5cea1e3356ac35.png';
import { apiService } from '../services/api';

interface LoginFormProps {
  onLoginSuccess: () => void;
  theme?: 'light' | 'dark' | 'synthwave' | 'system';
  onThemeToggle?: () => void;
}

export function LoginForm({ onLoginSuccess, theme = 'system', onThemeToggle }: LoginFormProps) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await apiService.login(userId, password);
      onLoginSuccess();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      
      // Provide more helpful error messages
      if (errorMessage.includes('401') || errorMessage.includes('Invalid credentials')) {
        setError('Invalid username or password. Please check your credentials and try again.');
      } else if (errorMessage.includes('422') || errorMessage.includes('request format')) {
        setError('Authentication format error. Please contact support if this persists.');
      } else if (errorMessage.includes('timeout')) {
        setError('Connection timeout. Please check your network and try again.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        <Card className="w-full">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <ImageWithFallback 
                src={extremeNetworksLogo}
                alt="AURA Platform"
                className="h-12 w-12 object-contain"
              />
            </div>
            <CardTitle className="text-2xl"><span className="font-bold">Extreme</span> Platform ONE™ | AURA</CardTitle>
            <CardDescription className="text-center mt-2">
              Autonomous Unified Radio Agent
            </CardDescription>
          </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="userId">User ID / Username</Label>
              <Input
                id="userId"
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Enter your username or user ID"
                required
                disabled={isLoading}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !userId.trim() || !password.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>
        </CardContent>
        </Card>
      </div>
    </div>
  );
}