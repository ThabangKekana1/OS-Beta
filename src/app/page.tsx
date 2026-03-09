import Link from "next/link";
import { Shield, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="max-w-lg text-center">
        <div className="mb-8 flex justify-center">
          <Shield size={48} className="text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Foundation-1</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Energy-as-a-service distribution platform
        </p>
        <div className="mt-2 inline-block rounded-sm border border-border px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          Pilot Command Centre
        </div>
        <div className="mt-10">
          <Link href="/login">
            <Button className="gap-2">
              Access Command Centre
              <ArrowRight size={14} />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
