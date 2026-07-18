// components/Navigation.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/match-finden", label: "Match finden" },
  { href: "/nachrichten", label: "Nachrichten" },
  { href: "/profil", label: "Profil" },
];

export function Navigation() {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (!session) return null;

  return (
    <nav className="flex items-center justify-between border-b bg-card px-6 py-3">
      <div className="flex items-center gap-6">
        <span className="font-semibold text-primary">Lunch Match</span>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "text-sm font-medium text-muted-foreground hover:text-foreground",
              pathname?.startsWith(link.href) && "text-foreground underline underline-offset-4"
            )}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
        Logout
      </Button>
    </nav>
  );
}
