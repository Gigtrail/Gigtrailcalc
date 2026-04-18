import React from "react";
import { 
  Shield, 
  Users, 
  Star, 
  Wrench, 
  Search, 
  MoreHorizontal, 
  ExternalLink, 
  ArrowUpRight, 
  Copy, 
  CheckCircle2,
  Terminal
} from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const USERS = [
  { id: "usr_2vX9kLp", email: "sarah.jenkins@example.com", name: "Sarah Jenkins", role: "pro", initials: "SJ" },
  { id: "usr_9mL4yTq", email: "mike.roberts@domain.co", name: "Mike Roberts", role: "free", initials: "MR" },
  { id: "usr_1aB7xHc", email: "alex.chen@startup.io", name: "Alex Chen", role: "tester", initials: "AC" },
  { id: "usr_5pN8vKw", email: "jessica.wu@design.net", name: "Jessica Wu", role: "free", initials: "JW" },
  { id: "usr_3tC2rFm", email: "david.miller@agency.com", name: "David Miller", role: "free", initials: "DM" },
  { id: "usr_8kD5jLn", email: "emily.davis@studio.co", name: "Emily Davis", role: "admin", initials: "ED" },
];

const PROMO_CODES = [
  { code: "TESTER101", role: "tester", uses: 42, max: 100 },
  { code: "EARLYBIRD", role: "pro", uses: 128, max: null },
  { code: "FRIENDS24", role: "free", uses: 15, max: 50 },
  { code: "VIPACCESS", role: "pro", uses: 3, max: 10 },
];

export function CardsFirst() {
  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-900 font-sans">
      <div className="max-w-6xl mx-auto px-8 py-8 space-y-10">
        
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admin Dashboard</h1>
              <p className="text-sm text-slate-500 font-medium">System overview and user management</p>
            </div>
          </div>
          <Button variant="outline" className="gap-2 rounded-xl font-medium shadow-sm border-slate-200">
            <ExternalLink className="w-4 h-4 text-slate-500" />
            View Site
          </Button>
        </header>

        {/* Metrics Row */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="rounded-2xl shadow-sm border-slate-200/60 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Users className="w-24 h-24" />
            </div>
            <CardContent className="p-6 relative z-10 flex flex-col justify-between h-full space-y-4">
              <div className="flex justify-between items-start">
                <p className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Total Users</p>
                <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div>
                <h2 className="text-4xl font-bold text-slate-900">7</h2>
                <div className="flex items-center gap-1 mt-2 text-sm font-medium text-emerald-600 bg-emerald-50 w-fit px-2 py-0.5 rounded-full">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>+2 this week</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm border-slate-200/60 overflow-hidden relative">
             <div className="absolute top-0 right-0 p-4 opacity-10">
              <Users className="w-24 h-24" />
            </div>
            <CardContent className="p-6 relative z-10 flex flex-col justify-between h-full space-y-4">
              <div className="flex justify-between items-start">
                <p className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Free</p>
                <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div>
                <h2 className="text-4xl font-bold text-slate-900">4</h2>
                <div className="mt-2 text-sm font-medium text-slate-500 h-5 flex items-center">
                  <span>57% of total</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm border-slate-200/60 overflow-hidden relative">
             <div className="absolute top-0 right-0 p-4 opacity-10 text-amber-500">
              <Star className="w-24 h-24" />
            </div>
            <CardContent className="p-6 relative z-10 flex flex-col justify-between h-full space-y-4">
              <div className="flex justify-between items-start">
                <p className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Pro</p>
                <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                  <Star className="w-5 h-5" />
                </div>
              </div>
              <div>
                <h2 className="text-4xl font-bold text-slate-900">1</h2>
                <div className="mt-2 text-sm font-medium text-slate-500 h-5 flex items-center">
                  <span>14% conversion</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm border-slate-200/60 overflow-hidden relative">
             <div className="absolute top-0 right-0 p-4 opacity-10 text-purple-500">
              <Wrench className="w-24 h-24" />
            </div>
            <CardContent className="p-6 relative z-10 flex flex-col justify-between h-full space-y-4">
              <div className="flex justify-between items-start">
                <p className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Tester / Admin</p>
                <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                  <Wrench className="w-5 h-5" />
                </div>
              </div>
              <div>
                <h2 className="text-4xl font-bold text-slate-900">2</h2>
                <div className="mt-2 text-sm font-medium text-slate-500 h-5 flex items-center">
                  <span>Internal team</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Users Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-slate-900">Users</h3>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input placeholder="Search emails..." className="pl-9 w-64 rounded-xl border-slate-200 bg-white" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600">Show All</span>
                <Switch />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {USERS.map((user) => (
              <Card key={user.id} className="rounded-xl border-slate-200/70 shadow-none hover:shadow-sm transition-shadow group bg-white">
                <CardContent className="p-5 flex items-center gap-4">
                  <Avatar className="h-12 w-12 border border-slate-100 shadow-sm">
                    <AvatarFallback className="bg-slate-50 text-slate-600 font-semibold">{user.initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
                    <p className="text-xs text-slate-500 truncate mb-1.5">{user.email}</p>
                    <div className="flex items-center gap-2">
                      {user.role === 'pro' && <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-none font-semibold text-[10px] px-2 py-0">PRO</Badge>}
                      {user.role === 'admin' && <Badge variant="secondary" className="bg-indigo-100 text-indigo-800 hover:bg-indigo-100 border-none font-semibold text-[10px] px-2 py-0">ADMIN</Badge>}
                      {user.role === 'tester' && <Badge variant="secondary" className="bg-purple-100 text-purple-800 hover:bg-purple-100 border-none font-semibold text-[10px] px-2 py-0">TESTER</Badge>}
                      {user.role === 'free' && <Badge variant="secondary" className="bg-slate-100 text-slate-600 hover:bg-slate-100 border-none font-semibold text-[10px] px-2 py-0">FREE</Badge>}
                      
                      <span className="text-[10px] font-mono text-slate-400">{user.id}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Promo Codes Section */}
        <section className="space-y-6">
          <h3 className="text-xl font-semibold text-slate-900">Promo Codes</h3>
          <div className="flex flex-wrap gap-3">
            {PROMO_CODES.map((promo) => (
              <div key={promo.code} className="inline-flex items-center gap-3 bg-white border border-slate-200 rounded-full py-1.5 px-2 pr-4 shadow-sm">
                <div className="bg-slate-50 rounded-full px-3 py-1 flex items-center gap-2 border border-slate-100">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  <span className="font-mono text-sm font-bold text-slate-700">{promo.code}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-slate-500 leading-none">
                    Grants: <span className="font-semibold text-slate-700 uppercase">{promo.role}</span>
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5 leading-none">
                    {promo.uses} {promo.max ? `/ ${promo.max}` : ''} used
                  </span>
                </div>
              </div>
            ))}
            <Button variant="outline" className="rounded-full border-dashed border-slate-300 text-slate-500 hover:border-slate-400 border-2 py-1.5 h-auto">
              + New Code
            </Button>
          </div>
        </section>

        {/* Auth Debug Card */}
        <section className="pt-4 pb-12">
          <Card className="bg-amber-50/50 border-amber-200/60 shadow-none rounded-xl">
            <CardHeader className="pb-3 border-b border-amber-200/40">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-600" />
                <CardTitle className="text-sm font-semibold text-amber-900">Session Debug</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2 font-mono text-xs">
                <div className="flex justify-between py-1 border-b border-amber-200/30">
                  <span className="text-amber-700/70">userId</span>
                  <span className="text-amber-900 font-medium">usr_8kD5jLn</span>
                </div>
                <div className="flex justify-between py-1 border-b border-amber-200/30">
                  <span className="text-amber-700/70">role</span>
                  <span className="text-amber-900 font-medium">admin</span>
                </div>
                <div className="flex justify-between py-1 border-b border-amber-200/30">
                  <span className="text-amber-700/70">sessionId</span>
                  <span className="text-amber-900 font-medium">sess_3pQ1xMw</span>
                </div>
                <div className="flex justify-between py-1 border-b border-amber-200/30">
                  <span className="text-amber-700/70">orgId</span>
                  <span className="text-amber-900 font-medium">null</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

      </div>
    </div>
  );
}
