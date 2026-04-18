import React, { useState } from "react";
import { 
  Search, 
  Check, 
  X, 
  ChevronDown, 
  ChevronRight, 
  MoreHorizontal, 
  ExternalLink, 
  Plus,
  ShieldAlert,
  Ticket
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MOCK_USERS = [
  { id: "usr_9f82h1", email: "sarah.connor@example.com", role: "Pro", source: "Stripe Checkout", joined: "2023-10-12" },
  { id: "usr_2x78p9", email: "james.holden@rocinante.hq", role: "Admin", source: "Manual Grant", joined: "2023-01-05" },
  { id: "usr_4m55k2", email: "alex.kamal@example.com", role: "Free", source: "Organic Sign-up", joined: "2024-02-18" },
  { id: "usr_8n33v1", email: "amos.burton@example.com", role: "Tester", source: "Promo: TESTER101", joined: "2024-03-01" },
  { id: "usr_1k99m4", email: "naomi.nagata@example.com", role: "Pro", source: "Stripe Checkout", joined: "2023-11-20" },
  { id: "usr_5c22l8", email: "chrisjen.avasarala@un.gov", role: "Free", source: "Organic Sign-up", joined: "2024-04-05" },
];

const MOCK_PROMOS = [
  { code: "TESTER101", grants: "Tester (30 days)", uses: "42 / 100", active: true },
  { code: "EARLYBIRD", grants: "Pro (Lifetime)", uses: "89 / 100", active: false },
];

const ROLES = ["All", "Free", "Pro", "Tester", "Admin"];
const EDITABLE_ROLES = ["Free", "Pro", "Tester", "Admin"];

export function CommandCenter() {
  const [activeRole, setActiveRole] = useState("All");
  const [editingUserId, setEditingUserId] = useState<string | null>("usr_8n33v1");
  const [promoOpen, setPromoOpen] = useState(true);

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 flex flex-col font-sans text-zinc-900 dark:text-zinc-100">
      {/* Sticky Control Bar */}
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-zinc-950/95 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 px-4 flex items-center justify-between h-12 shadow-sm">
        <div className="flex items-center gap-4 h-full">
          <div className="flex items-center gap-2 text-zinc-500 font-medium text-sm">
            <ShieldAlert className="h-4 w-4" />
            <span>Admin</span>
          </div>
          
          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800" />
          
          <div className="flex items-center gap-1">
            {ROLES.map(role => (
              <button
                key={role}
                onClick={() => setActiveRole(role)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeRole === role 
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" 
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50"
                }`}
              >
                {role}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800" />

          <div className="relative flex items-center">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-zinc-400" />
            <Input 
              className="h-7 w-64 pl-8 text-xs bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 focus-visible:ring-1 focus-visible:ring-zinc-400" 
              placeholder="Search by email or ID..." 
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs px-3 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
            <ExternalLink className="mr-1.5 h-3 w-3" />
            View Site
          </Button>
          <Button size="sm" className="h-7 text-xs px-3 bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
            <Plus className="mr-1.5 h-3 w-3" />
            New Code
          </Button>
        </div>
      </header>

      {/* Main Data View */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto p-4 pt-2">
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/50">
                <TableRow className="border-zinc-200 dark:border-zinc-800 hover:bg-transparent">
                  <TableHead className="h-8 text-xs font-semibold text-zinc-500 w-[250px]">Email</TableHead>
                  <TableHead className="h-8 text-xs font-semibold text-zinc-500">User ID</TableHead>
                  <TableHead className="h-8 text-xs font-semibold text-zinc-500 w-[180px]">Role</TableHead>
                  <TableHead className="h-8 text-xs font-semibold text-zinc-500">Access Source</TableHead>
                  <TableHead className="h-8 text-xs font-semibold text-zinc-500">Joined</TableHead>
                  <TableHead className="h-8 text-xs font-semibold text-zinc-500 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_USERS.filter(u => activeRole === "All" || u.role === activeRole).map((user) => (
                  <TableRow key={user.id} className="border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50">
                    <TableCell className="py-2 text-sm font-medium">{user.email}</TableCell>
                    <TableCell className="py-2 text-xs font-mono text-zinc-500">{user.id}</TableCell>
                    <TableCell className="py-2">
                      {editingUserId === user.id ? (
                        <div className="flex items-center gap-1">
                          <Select defaultValue={user.role}>
                            <SelectTrigger className="h-6 w-[100px] text-xs border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:ring-1 focus:ring-zinc-400">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {EDITABLE_ROLES.map(r => (
                                <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950" onClick={() => setEditingUserId(null)}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => setEditingUserId(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Badge 
                          variant="secondary" 
                          className="font-normal text-xs cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                          onClick={() => setEditingUserId(user.id)}
                        >
                          {user.role}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-xs text-zinc-600 dark:text-zinc-400">{user.source}</TableCell>
                    <TableCell className="py-2 text-xs text-zinc-500">{user.joined}</TableCell>
                    <TableCell className="py-2 text-right">
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Promo Codes Panel */}
        <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
          <Collapsible open={promoOpen} onOpenChange={setPromoOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {promoOpen ? <ChevronDown className="h-3.5 w-3.5 text-zinc-400" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />}
              <Ticket className="h-3.5 w-3.5 text-zinc-400" />
              Promo Codes & Grants
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 pt-1">
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden">
                  <Table>
                    <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/50">
                      <TableRow className="border-zinc-200 dark:border-zinc-800 hover:bg-transparent">
                        <TableHead className="h-7 text-[11px] uppercase tracking-wider font-semibold text-zinc-500">Code</TableHead>
                        <TableHead className="h-7 text-[11px] uppercase tracking-wider font-semibold text-zinc-500">Grants</TableHead>
                        <TableHead className="h-7 text-[11px] uppercase tracking-wider font-semibold text-zinc-500">Uses</TableHead>
                        <TableHead className="h-7 text-[11px] uppercase tracking-wider font-semibold text-zinc-500">Status</TableHead>
                        <TableHead className="h-7 text-[11px] uppercase tracking-wider font-semibold text-zinc-500 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {MOCK_PROMOS.map((promo) => (
                        <TableRow key={promo.code} className="border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50">
                          <TableCell className="py-1.5 text-xs font-mono font-medium">{promo.code}</TableCell>
                          <TableCell className="py-1.5 text-xs text-zinc-600 dark:text-zinc-400">{promo.grants}</TableCell>
                          <TableCell className="py-1.5 text-xs text-zinc-500">{promo.uses}</TableCell>
                          <TableCell className="py-1.5">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              promo.active 
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                                : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                            }`}>
                              {promo.active ? 'Active' : 'Expired'}
                            </span>
                          </TableCell>
                          <TableCell className="py-1.5 text-right">
                             <Button variant="ghost" size="icon" className="h-5 w-5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
                                <MoreHorizontal className="h-3 w-3" />
                             </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </main>

      {/* Auth Debug Footer */}
      <footer className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 px-4 py-1.5 bg-zinc-100 dark:bg-zinc-900 flex justify-between items-center text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-4">
          <span><span className="text-zinc-400 dark:text-zinc-500">auth_status:</span> active</span>
          <span><span className="text-zinc-400 dark:text-zinc-500">role:</span> superadmin</span>
          <span><span className="text-zinc-400 dark:text-zinc-500">region:</span> us-east-1</span>
          <span><span className="text-zinc-400 dark:text-zinc-500">session_id:</span> 8f92a1b9</span>
        </div>
        <div>sys_v2.4.1</div>
      </footer>
    </div>
  );
}
