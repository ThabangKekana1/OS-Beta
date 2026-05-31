"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Menu, Moon, Sun, X } from "lucide-react";

const BUSINESS_REGISTRATION_URL = "/register";

type FeatureSection = {
  title: string;
  description: string;
  image: string;
  bg: string;
  text: string;
  linkText: string;
  linkHref: string;
  secondaryText?: string;
  secondaryHref?: string;
};

type NavItem =
  | { label: string; href: string; items?: never }
  | { label: string; href?: never; items: { label: string; href: string }[] };

const products = [
  {
    title: "Generocity",
    description:
      "Fully funded on-site solar installations. Zero capital expenditure, immediate savings.",
    image: "/generocity-clay.jpg",
    linkText: "Explore",
    href: "/generocity",
  },
  {
    title: "Lumen",
    description:
      "Energy-as-Service via the grid. No installation needed. Reliable power. backed by 56MW solar farm.",
    image: "/lumen-hero.jpg",
    linkText: "Discover",
    href: "/lumen",
  },
];

const audienceCards = [
  {
    title: "For Businesses",
    description: "Future-proof your operations with resilient energy.",
    image: "/for-business.jpg",
    linkText: "Discover",
    href: "/for-business",
  },
  {
    title: "For Developers",
    description: "Access the energy infrastructure needed to power commercial and residential property developments.",
    image: "/for-developers.jpg",
    linkText: "Discover",
    href: "/for-developers",
  },
];

const featureSections: FeatureSection[] = [
  {
    title: "Powering African Progress.",
    description:
      "Get free solar panels, free installation, free maintenance, and fully insured energy infrastructure. Businesses can save up to 40% on monthly electricity costs.",
    image: "/home-hero-exact.jpg",
    bg: "bg-[#0b0b0b]",
    text: "text-white",
    linkText: "Get Started",
    linkHref: BUSINESS_REGISTRATION_URL,
    secondaryText: "Careers",
    secondaryHref: "/careers",
  },
  {
    title: "The Vision.",
    description:
      "Accelerating the Republic's transition to a high-growth civilization where scarcity is replaced by renewable abundance.",
    image: "/vision-new.jpg",
    bg: "bg-[#e3f2fd]",
    text: "text-black",
    linkText: "Learn More",
    linkHref: "/company",
  },
  {
    title: "How It Works.",
    description:
      "From application to energization, we handle the complexity so you can focus on growth.",
    image: "/how-it-works-new.jpg",
    bg: "bg-[#f5f5f5]",
    text: "text-black",
    linkText: "See the Process",
    linkHref: "/how-it-works",
  },
  {
    title: "Join the Mission.",
    description:
      "We are looking for the best minds to help us architect the future of South Africa.",
    image: "/join-the-mission.jpg",
    bg: "bg-[#fff3e0]",
    text: "text-black",
    linkText: "View Careers",
    linkHref: "/careers",
  },
];

const navItems: NavItem[] = [
  { label: "Home", href: "/" },
  {
    label: "Products",
    items: [
      { label: "Generocity", href: "/generocity" },
      { label: "Lumen", href: "/lumen" },
      { label: "How It Works", href: "/how-it-works" },
    ],
  },
  { label: "Business", href: "/for-business" },
  { label: "Developers", href: "/for-developers" },
  { label: "Company", href: "/company" },
  { label: "Research", href: "/research" },
  { label: "Careers", href: "/careers" },
];

const footerColumns = [
  {
    title: "Company",
    links: [
      { label: "About Us", href: "/company" },
      { label: "How It Works", href: "/how-it-works" },
      { label: "Careers", href: "/careers" },
      { label: "Research", href: "/research" },
      { label: "Contact Us", href: "/contact" },
    ],
  },
  {
    title: "Ecosystem",
    links: [
      { label: "Generocity", href: "/generocity" },
      { label: "Lumen", href: "/lumen" },
      { label: "Business", href: "/for-business" },
      { label: "Developers", href: "/for-developers" },
    ],
  },
  {
    title: "Support & Legal",
    links: [
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "POPIA Compliance", href: "/popia" },
      { label: "Contact Us", href: "/contact" },
      { label: "info@foundation-1.co.za", href: "mailto:info@foundation-1.co.za" },
    ],
  },
];

function GlassButton({
  href,
  children,
  light = false,
}: {
  href: string;
  children: React.ReactNode;
  light?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "inline-flex min-h-11 items-center justify-center rounded-full border px-6 py-3 text-sm font-semibold transition",
        "shadow-[0_18px_36px_rgba(0,0,0,0.18)] backdrop-blur-xl",
        light
          ? "border-white/70 bg-white/45 text-white hover:bg-white/55"
          : "border-black/10 bg-white/70 text-black hover:bg-white",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

function FeatureBand({ section, id, theme }: { section: FeatureSection; id?: string; theme: "dark" | "light" }) {
  const isLightMode = theme === "light";
  const isDarkPanel = !isLightMode && section.text === "text-white";
  const panelClass =
    isLightMode && id === "hero"
      ? "bg-white text-black"
      : isLightMode && id === "process"
        ? "bg-[#dbeafe] text-[#102a43]"
        : `${section.bg} ${section.text}`;

  return (
    <section id={id} className="w-full">
      <div
        className={`${panelClass} grid min-h-[620px] overflow-hidden rounded-[2rem] px-6 py-12 sm:px-10 lg:grid-cols-[1.18fr_0.82fr] lg:items-center lg:p-20`}
      >
        <div className="max-w-3xl">
          <h1 className="text-[clamp(2.75rem,7vw,5.75rem)] font-normal leading-[0.98] tracking-[-0.055em]">
            {section.title}
          </h1>
          <p
            className={[
              "mt-7 max-w-2xl text-lg leading-8 sm:text-xl",
              isDarkPanel ? "text-white/86" : "text-black/72",
            ].join(" ")}
          >
            {section.description}
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <GlassButton href={section.linkHref} light={isDarkPanel}>
              {section.linkText}
            </GlassButton>
            {section.secondaryHref ? (
              <GlassButton href={section.secondaryHref} light={isDarkPanel}>
                {section.secondaryText}
              </GlassButton>
            ) : null}
          </div>
        </div>

        <div className="mt-12 flex justify-center lg:mt-0">
          <div className="relative aspect-square w-full max-w-[500px] overflow-hidden rounded-[30%_70%_70%_30%/30%_30%_70%_70%] bg-black/10 shadow-[0_30px_90px_rgba(0,0,0,0.24)]">
            <Image
              src={section.image}
              alt={section.title}
              fill
              sizes="(max-width: 1024px) 80vw, 40vw"
              priority={id === "hero"}
              className="object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function ImageCard({
  title,
  description,
  image,
  href,
  linkText,
}: {
  title: string;
  description: string;
  image: string;
  href: string;
  linkText: string;
}) {
  return (
    <article className="group relative min-h-[360px] overflow-hidden rounded-[1.875rem] bg-neutral-900 shadow-[0_24px_70px_rgba(0,0,0,0.22)] sm:min-h-[440px]">
      <Image
        src={image}
        alt={title}
        fill
        sizes="(max-width: 1024px) 100vw, 50vw"
        className="object-cover transition duration-500 group-hover:scale-[1.035]"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/82 via-black/42 to-transparent p-7 text-white sm:p-9">
        <h2 className="text-3xl font-normal tracking-[-0.04em]">{title}</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/82">{description}</p>
        <Link href={href} className="mt-5 inline-flex rounded-full border border-white/50 bg-white/20 px-5 py-2 text-sm font-semibold backdrop-blur-xl transition hover:bg-white/30">
          {linkText}
        </Link>
      </div>
    </article>
  );
}

export function PublicMarketingShell({ children }: { children: (theme: "dark" | "light") => React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const isLight = theme === "light";
  const logoSrc = isLight ? "/logo-light.png" : "/logo.png";
  const logoWidth = isLight ? 160 : 216;
  const logoHeight = isLight ? 89 : 146;

  const closeMobile = () => {
    setMobileOpen(false);
    setProductsOpen(false);
  };

  return (
    <main className={isLight ? "min-h-screen bg-[#f5f5f7] text-black" : "min-h-screen bg-black text-white"}>
      <header
        className={[
          "fixed inset-x-0 top-0 z-50 border-b backdrop-blur-2xl",
          isLight ? "border-black/10 bg-white/90" : "border-white/10 bg-black/90",
        ].join(" ")}
      >
        <div className="mx-auto flex h-[72px] max-w-[1600px] items-center px-5 sm:px-8 lg:px-12">
          <Link href="/" aria-label="1OS home" className="flex h-12 items-center">
            <Image
              src={logoSrc}
              alt="1OS"
              width={logoWidth}
              height={logoHeight}
              priority
              sizes="82px"
              className={isLight ? "h-auto w-[41px]" : "h-auto w-[55px]"}
            />
          </Link>

          <nav
            className={[
              "absolute left-[calc(50%+2.25rem)] hidden -translate-x-1/2 items-center gap-8 text-sm font-medium lg:flex",
              isLight ? "text-black/64" : "text-white/64",
            ].join(" ")}
          >
            {navItems.map((item) =>
              item.items ? (
                <div key={item.label} className="group relative flex items-center py-6">
                  <button className={isLight ? "flex items-center gap-1 transition group-hover:text-black" : "flex items-center gap-1 transition group-hover:text-white"}>
                    {item.label}
                    <ChevronDown size={14} className="transition group-hover:rotate-180" />
                  </button>
                  <div
                    className={[
                      "invisible absolute left-1/2 top-full flex min-w-52 -translate-x-1/2 flex-col rounded-md border p-2 opacity-0 shadow-2xl backdrop-blur-2xl transition group-hover:visible group-hover:opacity-100",
                      isLight ? "border-black/10 bg-white/95" : "border-white/10 bg-black/95",
                    ].join(" ")}
                  >
                    {item.items.map((subItem) => (
                      <Link
                        key={subItem.href}
                        href={subItem.href}
                        className={isLight ? "rounded px-4 py-3 text-center text-sm text-black/64 transition hover:bg-black/10 hover:text-black" : "rounded px-4 py-3 text-center text-sm text-white/64 transition hover:bg-white/8 hover:text-white"}
                      >
                        {subItem.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link key={item.href} href={item.href} className={isLight ? "transition hover:text-black" : "transition hover:text-white"}>
                  {item.label}
                </Link>
              ),
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href={BUSINESS_REGISTRATION_URL}
              className={[
                "inline-flex min-h-10 items-center rounded-full border px-5 py-2 text-sm font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-xl transition",
                isLight ? "border-black/10 bg-black/8 text-black hover:bg-black/12" : "border-white/30 bg-white/18 text-white hover:bg-white/26",
              ].join(" ")}
            >
              Get Started
            </Link>
            <button
              type="button"
              aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
              aria-pressed={isLight}
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              className={[
                "inline-flex h-10 w-10 items-center justify-center rounded-full border transition",
                isLight ? "border-black/10 bg-black/5 text-black hover:bg-black/10" : "border-white/20 bg-white/10 text-white hover:bg-white/18",
              ].join(" ")}
            >
              {isLight ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button
              type="button"
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((open) => !open)}
              className={isLight ? "inline-flex h-10 w-10 items-center justify-center text-black lg:hidden" : "inline-flex h-10 w-10 items-center justify-center text-white lg:hidden"}
            >
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {mobileOpen ? (
            <nav
              className={[
                "fixed inset-0 top-[72px] z-40 flex h-[calc(100dvh-72px)] flex-col items-center justify-center gap-7 px-6 text-lg font-medium",
                isLight ? "bg-white/98 text-black" : "bg-black/98 text-white",
              ].join(" ")}
            >
              {navItems.map((item) =>
                item.items ? (
                  <div key={item.label} className="flex w-full max-w-xs flex-col items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setProductsOpen((open) => !open)}
                      className={isLight ? "flex items-center gap-1 text-black/84 transition hover:text-black" : "flex items-center gap-1 text-white/84 transition hover:text-white"}
                    >
                      {item.label}
                      <ChevronDown size={16} className={productsOpen ? "rotate-180 transition" : "transition"} />
                    </button>
                    {productsOpen ? (
                      <div className={isLight ? "flex flex-col items-center gap-3 text-base text-black/64" : "flex flex-col items-center gap-3 text-base text-white/64"}>
                        {item.items.map((subItem) => (
                          <Link key={subItem.href} href={subItem.href} onClick={closeMobile} className={isLight ? "transition hover:text-black" : "transition hover:text-white"}>
                            {subItem.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <Link key={item.href} href={item.href} onClick={closeMobile} className={isLight ? "text-black/84 transition hover:text-black" : "text-white/84 transition hover:text-white"}>
                    {item.label}
                  </Link>
                ),
              )}
              <Link
                href={BUSINESS_REGISTRATION_URL}
                onClick={closeMobile}
                className={[
                  "mt-3 inline-flex min-h-11 items-center rounded-full border px-6 py-3 text-sm font-semibold backdrop-blur-xl transition",
                  isLight ? "border-black/10 bg-black/8 text-black hover:bg-black/12" : "border-white/30 bg-white/18 text-white hover:bg-white/26",
                ].join(" ")}
              >
                Get Started
              </Link>
            </nav>
          ) : null}
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px] flex-col gap-16 px-4 pb-0 pt-[calc(72px+4rem)] sm:px-8 lg:px-12">
        {children(theme)}

        <footer className={isLight ? "border-t border-black/10 bg-[#f5f5f7] pt-16 text-sm" : "border-t border-white/12 bg-black pt-16 text-sm"}>
          <div className="grid gap-12 pb-12 lg:grid-cols-[2fr_1fr_1fr_1fr]">
            <div className="flex flex-col gap-4">
              <Image
                src={logoSrc}
                alt="1OS"
                width={logoWidth}
                height={logoHeight}
                sizes="88px"
                className={isLight ? "h-auto w-[66px]" : "h-auto w-[88px]"}
              />
              <p className={isLight ? "max-w-[280px] leading-6 text-black/56" : "max-w-[280px] leading-6 text-white/56"}>Powering human progress.</p>
            </div>

            {footerColumns.map((column) => (
              <div key={column.title} className="flex flex-col gap-3">
                <h4 className={isLight ? "mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-black/40" : "mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/40"}>{column.title}</h4>
                {column.links.map((link) =>
                  link.href.startsWith("mailto:") ? (
                    <a key={link.href} href={link.href} className={isLight ? "text-black/56 transition hover:text-black" : "text-white/56 transition hover:text-white"}>
                      {link.label}
                    </a>
                  ) : (
                    <Link key={link.href} href={link.href} className={isLight ? "text-black/56 transition hover:text-black" : "text-white/56 transition hover:text-white"}>
                      {link.label}
                    </Link>
                  ),
                )}
              </div>
            ))}
          </div>

          <div className={isLight ? "border-t border-black/10 py-8" : "border-t border-white/10 py-8"}>
            <p className={isLight ? "text-xs text-black" : "text-xs text-white"}>
              © 2026 1OS | Reg: 2026/138664/07 | BBBEE Level 1 | All rights reserved. |{" "}
              <a
                href="mailto:sales@foundation-1.co.za"
                className={isLight ? "text-black transition hover:text-black/70" : "text-white transition hover:text-white/70"}
              >
                sales@foundation-1.co.za
              </a>{" "}
              |{" "}
              <a
                href="https://x.com/Foundation1X"
                target="_blank"
                rel="noopener noreferrer"
                className={isLight ? "text-black transition hover:text-black/70" : "text-white transition hover:text-white/70"}
              >
                Twitter
              </a>{" "}
              |{" "}
              <a
                href="https://foundation-1.co.za"
                target="_blank"
                rel="noopener noreferrer"
                className={isLight ? "text-black transition hover:text-black/70" : "text-white transition hover:text-white/70"}
              >
                Foundation-1
              </a>
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}

export function PublicMarketingStaticShell({ children }: { children: React.ReactNode }) {
  return <PublicMarketingShell>{() => children}</PublicMarketingShell>;
}

export function PublicMarketingLandingRoute() {
  return (
    <PublicMarketingShell>
      {(theme) => (
        <>
          <FeatureBand section={featureSections[0]} id="hero" theme={theme} />

          <section id="products" className="grid gap-6 lg:grid-cols-2">
            {products.map((product) => (
              <ImageCard key={product.title} {...product} />
            ))}
          </section>

          <FeatureBand section={featureSections[1]} theme={theme} />
          <FeatureBand section={featureSections[2]} id="process" theme={theme} />

          <section id="audiences" className="grid gap-6 lg:grid-cols-2">
            {audienceCards.map((card) => (
              <ImageCard key={card.title} {...card} />
            ))}
          </section>

          <FeatureBand section={featureSections[3]} theme={theme} />
        </>
      )}
    </PublicMarketingShell>
  );
}
