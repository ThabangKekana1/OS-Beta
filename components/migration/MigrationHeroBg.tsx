import Image from "next/image";

export default function MigrationHeroBg() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        background: "#000",
        overflow: "hidden",
      }}
    >
      <Image
        src="/migration-landing-hero-v7.avif"
        alt=""
        fill
        priority
        unoptimized
        sizes="100vw"
        style={{
          objectFit: "cover",
          objectPosition: "center",
        }}
      />
    </div>
  );
}
