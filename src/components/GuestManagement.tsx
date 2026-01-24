import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import {
  UserPlus,
  Ticket,
  Trash2,
  RefreshCw,
  CheckCircle,
  Clock,
  Mail,
  Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { TouchButton } from './TouchButton';
import { DesktopOnly } from './MobileOptimized';
import { apiService } from '../services/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

export function GuestManagement() {
  const [guests, setGuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newGuest, setNewGuest] = useState({
    name: '',
    email: '',
    duration: '24',
    company: ''
  });

  useEffect(() => {
    loadGuests();
  }, []);

  const loadGuests = async () => {
    setLoading(true);
    try {
      const data = await apiService.getGuests();
      setGuests(data);
    } catch (error) {
      console.error('Failed to load guests:', error);
      toast.error('Failed to load guest accounts');
    } finally {
      setLoading(false);
    }
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleCreateGuest = async () => {
    if (!newGuest.name || !newGuest.email) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!validateEmail(newGuest.email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    const duration = parseInt(newGuest.duration);
    if (duration < 1 || duration > 168) {
      toast.error('Duration must be between 1 and 168 hours (7 days)');
      return;
    }

    setCreating(true);
    try {
      await apiService.createGuest({
        name: newGuest.name,
        email: newGuest.email,
        duration: duration * 60 * 60, // Convert hours to seconds
        company: newGuest.company
      });
      toast.success('Guest account created successfully');
      setShowCreateDialog(false);
      setNewGuest({ name: '', email: '', duration: '24', company: '' });
      await loadGuests();
    } catch (error) {
      console.error('Failed to create guest:', error);
      toast.error('Failed to create guest account');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteGuest = async (guestId: string) => {
    if (!confirm('Are you sure you want to delete this guest account?')) return;

    try {
      await apiService.deleteGuest(guestId);
      toast.success('Guest account deleted');
      await loadGuests();
    } catch (error) {
      console.error('Failed to delete guest:', error);
      toast.error('Failed to delete guest account');
    }
  };

  const handleGenerateVoucher = async (guestId: string) => {
    try {
      const voucher = await apiService.generateGuestVoucher(guestId);
      toast.success('Voucher generated successfully');
      // You could show the voucher in a dialog or copy to clipboard
      console.log('Voucher:', voucher);
    } catch (error) {
      console.error('Failed to generate voucher:', error);
      toast.error('Failed to generate voucher');
    }
  };

  const isExpired = (expirationDate: string): boolean => {
    return new Date(expirationDate).getTime() < Date.now();
  };

  const formatExpirationDate = (expirationDate: string): string => {
    const date = new Date(expirationDate);
    const hoursUntil = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60));

    if (hoursUntil < 0) return 'Expired';
    if (hoursUntil < 1) return 'Expires soon';
    if (hoursUntil < 24) return `Expires in ${hoursUntil}h`;

    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <UserPlus className="h-6 w-6" />
            Guest Management
          </h2>
          <p className="text-muted-foreground">
            Manage guest wireless access accounts
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadGuests} aria-label="Refresh guest list">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreateDialog(true)} aria-label="Create new guest account">
            <UserPlus className="h-4 w-4 mr-2" />
            Create Guest
          </Button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Guests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{guests.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">
                {guests.filter(g => !isExpired(g.expirationDate)).length}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Expired
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {guests.filter(g => isExpired(g.expirationDate)).length}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Guest List */}
      <Card>
        <CardHeader>
          <CardTitle>Guest Accounts</CardTitle>
          <CardDescription>
            Manage temporary guest wireless access
          </CardDescription>
        </CardHeader>
        <CardContent>
          {guests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <UserPlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No guest accounts</p>
              <p className="text-sm mt-2">Create guest accounts for temporary access</p>
            </div>
          ) : (
            <div className="space-y-2">
              {guests.map((guest) => (
                <div
                  key={guest.id}
                  className="flex items-start justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-start gap-3">
                    <UserPlus className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{guest.name}</h3>
                        {isExpired(guest.expirationDate) ? (
                          <Badge variant="outline">Expired</Badge>
                        ) : (
                          <Badge className="bg-green-500">Active</Badge>
                        )}
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        {guest.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3" />
                            <span>{guest.email}</span>
                          </div>
                        )}
                        {guest.company && (
                          <div>
                            <span>Company: {guest.company}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          <span>{formatExpirationDate(guest.expirationDate)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleGenerateVoucher(guest.id)}
                      disabled={isExpired(guest.expirationDate)}
                      aria-label={`Generate voucher for ${guest.name}`}
                    >
                      <Ticket className="h-4 w-4 mr-2" />
                      Voucher
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteGuest(guest.id)}
                      aria-label={`Delete guest account for ${guest.name}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Guest Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Guest Account</DialogTitle>
            <DialogDescription>
              Create a temporary wireless access account for a guest
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="guest-name">Guest Name *</Label>
              <Input
                id="guest-name"
                value={newGuest.name}
                onChange={(e) => setNewGuest({ ...newGuest, name: e.target.value })}
                placeholder="John Doe"
                aria-label="Enter guest name"
                aria-required="true"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-email">Email Address *</Label>
              <Input
                id="guest-email"
                type="email"
                value={newGuest.email}
                onChange={(e) => setNewGuest({ ...newGuest, email: e.target.value })}
                placeholder="john@example.com"
                aria-label="Enter guest email address"
                aria-required="true"
                aria-describedby="email-hint"
              />
              <p id="email-hint" className="text-xs text-muted-foreground">
                A valid email address is required for guest access
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-company">Company</Label>
              <Input
                id="guest-company"
                value={newGuest.company}
                onChange={(e) => setNewGuest({ ...newGuest, company: e.target.value })}
                placeholder="Acme Corp"
                aria-label="Enter company name (optional)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-duration">Access Duration (hours)</Label>
              <Input
                id="guest-duration"
                type="number"
                value={newGuest.duration}
                onChange={(e) => setNewGuest({ ...newGuest, duration: e.target.value })}
                min="1"
                max="168"
                aria-label="Set access duration in hours"
                aria-describedby="duration-hint"
              />
              <p id="duration-hint" className="text-xs text-muted-foreground">
                Duration must be between 1 and 168 hours (7 days)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={creating}
              aria-label="Cancel guest creation"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateGuest}
              disabled={creating}
              aria-label="Create guest account"
            >
              {creating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Create Account
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
