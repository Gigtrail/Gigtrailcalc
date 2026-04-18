import React, { useState } from "react";
import { Search, Shield, Users, Tag, ArrowUpRight, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

const mockUsers = [
  { id: "user_2aXbYcZ1", email: "alice@example.com", role: "admin" },
  { id: "user_9kLpQwR4", email: "bob@acmecorp.com", role: "user" },
  { id: "user_7vNmMbX9", email: "charlie@startup.io", role: "pro" },
  { id: "user_3tHjKqW2", email: "diana@design.co", role: "user" },
  { id: "user_5pRwZcX8", email: "edward@tech.net", role: "admin" },
  { id: "user_1mNxCkV5", email: "fiona@global.org", role: "pro" },
  { id: "user_8yTvPbL3", email: "george@local.biz", role: "user" },
];

export function SplitPane() {
  const [activeTab, setActiveTab] = useState("users");
  const [selectedUserId, setSelectedUserId] = useState(mockUsers[0].id);
  const [searchQuery, setSearchQuery] = useState("");
  
  const selectedUser = mockUsers.find(u => u.id === selectedUserId) || mockUsers[0];

  const filteredUsers = mockUsers.filter(u => 
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">
      {/* Left Pane - 38% */}
      <div className="w-[38%] min-w-[320px] max-w-[480px] border-r flex flex-col bg-muted/10">
        <div className="p-6 pb-4">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded bg-amber-500/20 text-amber-600 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">System Admin</h1>
          </div>

          <nav className="flex flex-col gap-1 mb-6">
            <button
              onClick={() => setActiveTab("users")}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === "users" 
                  ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-400" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Users className="w-4 h-4" />
              Users
            </button>
            <button
              onClick={() => setActiveTab("promos")}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === "promos" 
                  ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-400" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Tag className="w-4 h-4" />
              Promo Codes
            </button>
          </nav>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search users..."
              className="pl-9 bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="flex-1 border-t">
          <div className="flex flex-col">
            {filteredUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => setSelectedUserId(user.id)}
                className={`flex flex-col items-start p-4 border-b text-left transition-colors hover:bg-muted/50 ${
                  selectedUserId === user.id ? "bg-muted" : "bg-transparent"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-medium text-sm truncate">{user.email}</span>
                  <Badge variant={user.role === "admin" ? "default" : user.role === "pro" ? "secondary" : "outline"} className={user.role === "admin" ? "bg-amber-500 hover:bg-amber-600" : ""}>
                    {user.role}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground font-mono">{user.id}</span>
              </button>
            ))}
          </div>
        </ScrollArea>

        {/* Auth Debug Strip */}
        <div className="p-3 border-t bg-amber-500/10 dark:bg-amber-900/20 text-xs font-mono">
          <div className="flex items-center justify-between text-amber-800 dark:text-amber-400 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Auth Debug</span>
            <span className="opacity-70">Dev Only</span>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-muted-foreground">
            <div className="truncate"><span className="opacity-50">Email:</span> dev@admin.com</div>
            <div><span className="opacity-50">Role:</span> admin</div>
            <div><span className="opacity-50">Plan:</span> pro</div>
            <div><span className="opacity-50">Src:</span> db</div>
            <div><span className="opacity-50">IsAdmin:</span> true</div>
          </div>
        </div>
      </div>

      {/* Right Pane - 62% */}
      <div className="flex-1 flex flex-col bg-background">
        <header className="h-16 border-b flex items-center justify-between px-6 bg-card/50">
          <h2 className="text-sm font-medium text-muted-foreground">User Management</h2>
          <Button variant="outline" size="sm" className="gap-2">
            View Site
            <ArrowUpRight className="w-4 h-4" />
          </Button>
        </header>

        <div className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-2xl mx-auto">
            <div className="mb-8">
              <h1 className="text-3xl font-bold tracking-tight mb-2">User Detail</h1>
              <p className="text-muted-foreground">
                Manage roles and permissions for {selectedUser.email}
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Basic account details from Clerk.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Email Address</label>
                    <div className="text-sm font-medium">{selectedUser.email}</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">User ID</label>
                    <div className="text-sm font-mono bg-muted px-2 py-1 rounded inline-block">
                      {selectedUser.id}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium mb-1">Role Management</h3>
                    <p className="text-sm text-muted-foreground">
                      Change the user's access level. Admins have full system access.
                    </p>
                  </div>
                  
                  <div className="grid gap-3">
                    <label className="text-sm font-medium">Current Role</label>
                    <div className="flex items-center gap-4">
                      <Select defaultValue={selectedUser.role}>
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Badge variant={selectedUser.role === "admin" ? "default" : selectedUser.role === "pro" ? "secondary" : "outline"} className={selectedUser.role === "admin" ? "bg-amber-500 hover:bg-amber-600" : ""}>
                        {selectedUser.role} active
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <Button className="bg-amber-500 hover:bg-amber-600 text-white gap-2">
                    <Check className="w-4 h-4" />
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
