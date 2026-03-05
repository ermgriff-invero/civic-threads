import { useState } from "react";
import { motion } from "framer-motion";
import { 
  User, 
  Mail, 
  Building, 
  Shield, 
  Key, 
  Bell, 
  LogOut,
  Camera
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

export default function Profile() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    weekly: false,
    updates: true
  });

  const getInitials = () => {
    const first = user?.firstName?.charAt(0) || '';
    const last = user?.lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || 'U';
  };

  const getFullName = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user?.firstName) return user.firstName;
    return 'User';
  };

  const getRoleInfo = () => {
    const parts = [user?.title, user?.municipality].filter(Boolean);
    return parts.length > 0 ? parts.join(' • ') : 'No role information';
  };

  return (
    <div className="min-h-full p-4 md:p-8 space-y-8 pb-24 max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-6 mb-8">
          <div className="relative group cursor-pointer">
            <Avatar className="h-24 w-24 border-4 border-background shadow-xl">
              <AvatarImage src={user?.profileImageUrl || undefined} />
              <AvatarFallback className="text-2xl bg-primary/10 text-primary">{getInitials()}</AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-8 h-8 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-bold" data-testid="profile-full-name">{getFullName()}</h1>
            <p className="text-muted-foreground text-lg" data-testid="profile-role-info">{getRoleInfo()}</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="bg-[#FB4F14]/15 text-[#C43D0A] hover:bg-[#FB4F14]/25 border-[#FB4F14]/30">
                Active
              </Badge>
              <span className="text-sm text-muted-foreground">Last active: Just now</span>
            </div>
          </div>
        </div>

        <div className="grid gap-8">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                Personal Information
              </CardTitle>
              <CardDescription>Manage your contact details and role information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input defaultValue={getFullName()} data-testid="input-profile-name" />
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-9" defaultValue={user?.email || ''} data-testid="input-profile-email" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Title</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-9" defaultValue={user?.title || ''} placeholder="Your title" data-testid="input-profile-title" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Position / Department</Label>
                  <div className="relative">
                    <Building className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-9" defaultValue={user?.position || ''} placeholder="Your department" data-testid="input-profile-position" />
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Municipality</Label>
                  <div className="relative">
                    <Building className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-9" defaultValue={user?.municipality || ''} placeholder="Your municipality" data-testid="input-profile-municipality" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Notifications & Preferences
              </CardTitle>
              <CardDescription>Control how and when you receive updates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive daily summaries and important alerts</p>
                </div>
                <Switch 
                  checked={notifications.email}
                  onCheckedChange={(c) => setNotifications(prev => ({ ...prev, email: c }))}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Push Notifications</Label>
                  <p className="text-sm text-muted-foreground">Real-time alerts for thread updates</p>
                </div>
                <Switch 
                  checked={notifications.push}
                  onCheckedChange={(c) => setNotifications(prev => ({ ...prev, push: c }))}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Weekly Digest</Label>
                  <p className="text-sm text-muted-foreground">A summary of all department activity</p>
                </div>
                <Switch 
                  checked={notifications.weekly}
                  onCheckedChange={(c) => setNotifications(prev => ({ ...prev, weekly: c }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Security
              </CardTitle>
              <CardDescription>Manage your password and session settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button variant="outline" className="w-full justify-start">
                <Key className="w-4 h-4 mr-2" />
                Change Password
              </Button>
              <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out of All Devices
              </Button>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </div>
  );
}
