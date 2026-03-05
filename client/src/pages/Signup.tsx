import { useState } from "react";
import { Link } from "wouter";
import { Network, Loader2, Eye, EyeOff, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export default function Signup() {
  const { register, registerError, isRegistering } = useAuth();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    title: "",
    position: "",
    municipality: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");

  const passwordRequirements = [
    { text: "At least 8 characters", met: formData.password.length >= 8 },
    { text: "Contains a number", met: /\d/.test(formData.password) },
    { text: "Contains uppercase letter", met: /[A-Z]/.test(formData.password) },
  ];

  const passwordsMatch = formData.password === formData.confirmPassword && formData.confirmPassword.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    if (formData.password !== formData.confirmPassword) {
      setLocalError("Passwords do not match");
      return;
    }

    if (formData.password.length < 8) {
      setLocalError("Password must be at least 8 characters");
      return;
    }

    register({
      email: formData.email,
      password: formData.password,
      firstName: formData.firstName,
      lastName: formData.lastName,
      title: formData.title || undefined,
      position: formData.position || undefined,
      municipality: formData.municipality || undefined,
    });
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const displayError = localError || registerError;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
              <Network className="w-7 h-7" />
            </div>
            <span className="font-bold text-2xl tracking-tight">Civic Threads</span>
          </Link>
        </div>

        <Card className="border-border/50 shadow-xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl">Create your account</CardTitle>
            <CardDescription>Get started with Civic Threads today</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {displayError && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm" data-testid="error-register">
                  {displayError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    value={formData.firstName}
                    onChange={(e) => updateField("firstName", e.target.value)}
                    required
                    autoComplete="given-name"
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Doe"
                    value={formData.lastName}
                    onChange={(e) => updateField("lastName", e.target.value)}
                    required
                    autoComplete="family-name"
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  type="text"
                  placeholder="e.g., City Clerk, Mayor, Council Member"
                  value={formData.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  autoComplete="organization-title"
                  data-testid="input-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="position">Position/Department</Label>
                <Input
                  id="position"
                  type="text"
                  placeholder="e.g., City Manager's Office, Planning Dept"
                  value={formData.position}
                  onChange={(e) => updateField("position", e.target.value)}
                  data-testid="input-position"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="municipality">Municipality</Label>
                <Input
                  id="municipality"
                  type="text"
                  placeholder="e.g., City of Springfield"
                  value={formData.municipality}
                  onChange={(e) => updateField("municipality", e.target.value)}
                  autoComplete="organization"
                  data-testid="input-municipality"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@municipality.gov"
                  value={formData.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  required
                  autoComplete="email"
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a strong password"
                    value={formData.password}
                    onChange={(e) => updateField("password", e.target.value)}
                    required
                    autoComplete="new-password"
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {formData.password.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {passwordRequirements.map((req) => (
                      <div key={req.text} className="flex items-center gap-2 text-xs">
                        {req.met ? (
                          <Check className="w-3 h-3 text-[#FB4F14]" />
                        ) : (
                          <X className="w-3 h-3 text-muted-foreground" />
                        )}
                        <span className={req.met ? "text-[#C43D0A] dark:text-[#FFA07A]" : "text-muted-foreground"}>
                          {req.text}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={(e) => updateField("confirmPassword", e.target.value)}
                  required
                  autoComplete="new-password"
                  data-testid="input-confirm-password"
                />
                {formData.confirmPassword.length > 0 && (
                  <div className="flex items-center gap-2 text-xs pt-1">
                    {passwordsMatch ? (
                      <>
                        <Check className="w-3 h-3 text-[#FB4F14]" />
                        <span className="text-[#C43D0A] dark:text-[#FFA07A]">Passwords match</span>
                      </>
                    ) : (
                      <>
                        <X className="w-3 h-3 text-destructive" />
                        <span className="text-destructive">Passwords do not match</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isRegistering || !passwordsMatch}
                data-testid="button-signup-submit"
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary font-medium hover:underline" data-testid="link-login">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By creating an account, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
