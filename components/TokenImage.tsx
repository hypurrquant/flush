"use client";
import Image from "next/image";

interface TokenImageProps {
  src: string | null;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
}

const DEFAULT_TOKEN_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23374151'/%3E%3Ctext x='16' y='21' text-anchor='middle' fill='%239CA3AF' font-size='14' font-family='system-ui'%3E?%3C/text%3E%3C/svg%3E";

export function TokenImage({ src, alt, width = 32, height = 32, className }: TokenImageProps) {
  return (
    <Image
      src={src || DEFAULT_TOKEN_IMAGE}
      alt={alt}
      width={width}
      height={height}
      className={className}
      unoptimized
    />
  );
}

