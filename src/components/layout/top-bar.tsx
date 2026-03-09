"use client";

import { Bell, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TopBarProps {
  user: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
  onSignOut: () => void;
}

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMINISTRATOR: "Administrator",
  SALES_REPRESENTATIVE: "Sales Rep",
  BUSINESS_USER: "Business",
};

export function TopBar({ user, onSignOut }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-sm">
      <div />
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell size={16} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent transition-colors"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-accent text-xs font-medium">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div className="hidden text-left md:block">
              <p className="text-xs font-medium leading-none">{user.firstName} {user.lastName}</p>
              <p className="text-[10px] text-muted-foreground">{roleLabels[user.role] ?? user.role}</p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-xs font-medium">{user.firstName} {user.lastName}</p>
              <p className="text-[10px] text-muted-foreground">{user.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User size={14} className="mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut} className="text-destructive">
              <LogOut size={14} className="mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
